use blake2::{Blake2s256, Digest};
use data_encoding::HEXLOWER;

pub const SECRET: &str = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/secret"));
pub fn hash(value: &str, salt: &str, iterations: u32) -> std::vec::Vec<u8> {
    let mut hasher = Blake2s256::new();
    let v = value.as_bytes();
    for _ in 0..iterations {
        hasher.update(v);
    }
    hasher.update(salt);
    hasher.update(SECRET);
    hasher.finalize().to_vec()
}

pub fn token_hash(token: &str, salt: &str) -> String {
    let hashed_token = hash(token, salt, 2);
    HEXLOWER.encode(&hashed_token)
}
