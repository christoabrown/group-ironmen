use blake2::{Blake2s256, Digest};
use data_encoding::HEXLOWER;
use lazy_static::lazy_static;
use std::fs;

lazy_static! {
    static ref SECRET: String = {
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/secret");
        fs::read_to_string(path).expect(&format!("Could not find secret file at {}", path))
    };
}

pub fn hash(value: &str, salt: &str, iterations: u32) -> std::vec::Vec<u8> {
    let mut hasher = Blake2s256::new();
    let v = value.as_bytes();
    for _ in 0..iterations {
        hasher.update(v);
    }
    hasher.update(salt);
    hasher.update(&SECRET.as_str());
    hasher.finalize().to_vec()
}

pub fn token_hash(token: &str, salt: &str) -> String {
    let hashed_token = hash(token, salt, 2);
    HEXLOWER.encode(&hashed_token)
}
