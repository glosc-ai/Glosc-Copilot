import MarkdownIt from "markdown-it";
import { katex } from "@mdit/plugin-katex";
import { tasklist } from "@mdit/plugin-tasklist";
import { footnote } from "@mdit/plugin-footnote";
import { mark } from "@mdit/plugin-mark";
import { sub } from "@mdit/plugin-sub";
import { sup } from "@mdit/plugin-sup";
import { abbr } from "@mdit/plugin-abbr";
import { ins } from "@mdit/plugin-ins";
import "katex/dist/katex.min.css";

export function createMarkdownParser() {
    const md = new MarkdownIt({
        html: false,
        linkify: true,
        breaks: true,
    });

    md.use(katex);
    md.use(tasklist);
    md.use(footnote);
    md.use(mark);
    md.use(sub);
    md.use(sup);
    md.use(abbr);
    md.use(ins);

    return md;
}
