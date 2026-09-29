use blake2::{Blake2s256, Digest};
use data_encoding::HEXLOWER;
use std::env;
use std::fs;
use std::sync::LazyLock;

/// The server-wide hashing secret.
///
/// Read from the file named by `SECRET_FILE`, else `./secret` (written by the
/// Docker entrypoint), else `<crate dir>/secret` for local development. When no
/// file exists, `BACKEND_SECRET` is used directly. The file takes precedence so
/// existing deployments keep producing the same token hashes.
static SECRET: LazyLock<String> = LazyLock::new(|| {
    let candidates = [
        env::var("SECRET_FILE").ok(),
        Some("secret".to_string()),
        Some(concat!(env!("CARGO_MANIFEST_DIR"), "/secret").to_string()),
    ];
    for path in candidates.into_iter().flatten() {
        if let Ok(secret) = fs::read_to_string(&path) {
            return secret;
        }
    }
    match env::var("BACKEND_SECRET") {
        Ok(secret) if !secret.is_empty() => secret,
        _ => panic!("No secret configured: set BACKEND_SECRET or provide a secret file"),
    }
});

pub fn hash(value: &str, salt: &str, iterations: u32) -> std::vec::Vec<u8> {
    let mut hasher = Blake2s256::new();
    let v = value.as_bytes();
    for _ in 0..iterations {
        hasher.update(v);
    }
    hasher.update(salt);
    hasher.update(SECRET.as_str());
    hasher.finalize().to_vec()
}

pub fn token_hash(token: &str, salt: &str) -> String {
    let hashed_token = hash(token, salt, 2);
    HEXLOWER.encode(&hashed_token)
}
