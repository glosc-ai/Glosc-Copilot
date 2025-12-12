import type { Element } from 'hast'
import type { BundledLanguage, ShikiTransformer } from 'shiki'
import { codeToHtml } from 'shiki'

const lineNumberTransformer: ShikiTransformer = {
  name: 'line-numbers',
  line(node: Element, line: number) {
    node.children.unshift({
      type: 'element',
      tagName: 'span',
      properties: {
        className: [
          'inline-block',
          'min-w-10',
          'mr-4',
          'text-right',
          'select-none',
          'text-muted-foreground',
        ],
      },
      children: [{ type: 'text', value: String(line) }],
    })
  },
}

// Cache for highlighted code to avoid re-highlighting the same content
const highlightCache = new Map<string, [string, string]>();
const MAX_CACHE_SIZE = 100;

// FNV-1a hash function for cache keys - better distribution and collision resistance
function fnv1aHash(str: string): string {
  let hash = 2166136261; // FNV offset basis
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619); // FNV prime
  }
  // Convert to unsigned 32-bit and then to base-36 string
  return (hash >>> 0).toString(36);
}

function getCacheKey(code: string, language: BundledLanguage, showLineNumbers: boolean): string {
  // Use FNV-1a hash to avoid collisions
  const codeHash = fnv1aHash(code);
  return `${language}:${showLineNumbers}:${codeHash}:${code.length}`;
}

export async function highlightCode(
  code: string,
  language: BundledLanguage,
  showLineNumbers = false,
) {
  const cacheKey = getCacheKey(code, language, showLineNumbers);
  
  // Check cache first
  if (highlightCache.has(cacheKey)) {
    return highlightCache.get(cacheKey)!;
  }

  const transformers: ShikiTransformer[] = showLineNumbers
    ? [lineNumberTransformer]
    : []

  const result = await Promise.all([
    codeToHtml(code, {
      lang: language,
      theme: 'one-light',
      transformers,
    }),
    codeToHtml(code, {
      lang: language,
      theme: 'one-dark-pro',
      transformers,
    }),
  ])

  // Store in cache with size limit
  if (highlightCache.size >= MAX_CACHE_SIZE) {
    // Remove oldest entry (first key)
    const firstKey = highlightCache.keys().next().value;
    if (firstKey !== undefined) {
      highlightCache.delete(firstKey);
    }
  }
  highlightCache.set(cacheKey, result);

  return result;
}
