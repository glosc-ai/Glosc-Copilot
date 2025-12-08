import CryptoJS from "crypto-js";

export class Cryption {
    /**
     * 加密数据
     * @param data 数据 (UTF-8 string)
     * @param key 密钥 (UTF-8 string, 32 chars for AES-256)
     * @returns Hex string
     */
    public static encryptData(data: string, key: string): string {
        const ciphertext = CryptoJS.AES.encrypt(data, key);
        return ciphertext.toString();
    }

    /**
     * 解密数据
     * @param encryptedData Hex string
     * @param key 密钥 (UTF-8 string)
     * @returns UTF-8 string
     */
    public static decryptData(text: string, key: string) {
        const bytes = CryptoJS.AES.decrypt(text, key);
        const data = bytes.toString(CryptoJS.enc.Utf8);
        return data;
    }
}
