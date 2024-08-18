import * as crypto from 'crypto';

export function strHashValue(plaintext: string, algorithm: string): string {
    const hash = crypto.createHash(algorithm);
    hash.update(plaintext);
    return hash.digest('hex');
}
