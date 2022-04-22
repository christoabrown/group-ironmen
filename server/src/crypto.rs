use crate::error::ApiError;
use crate::models::EncryptedData;
use aes_gcm::aead::{Aead, NewAead};
use blake2::{Blake2s256, Digest};
use data_encoding::HEXLOWER;
use rand::RngCore;
use serde::{de::DeserializeOwned, Serialize};

pub const SECRET: &str = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/secret"));
pub type Key = aes_gcm::Key<<aes_gcm::Aes256Gcm as aes_gcm::aead::NewAead>::KeySize>;
pub fn key(token: &str, salt: &str) -> Key {
    let hash = hash(token, salt, 1);
    let key = aes_gcm::Key::from_slice(&hash);
    *key
}

pub fn hash(value: &str, salt: &str, iterations: u32) -> std::vec::Vec<u8> {
    let mut hasher = Blake2s256::new();
    let v = value.as_bytes();
    for _ in 0..iterations {
        hasher.update(v);
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

pub struct Crypter(aes_gcm::Aes256Gcm);
impl Crypter {
    pub fn new(token: &str, salt: &str) -> Self {
        let key = key(token, salt);

        Self(aes_gcm::Aes256Gcm::new(&key))
    }

    pub fn encrypt<T>(&self, value: T) -> Result<EncryptedData, ApiError>
    where
        T: Serialize,
    {
        let plaintext = serde_json::to_vec(&value)?;

        let mut random_bytes = [0_u8; 12];
        rand::thread_rng().fill_bytes(&mut random_bytes);
        let nonce = aes_gcm::Nonce::from_slice(&random_bytes);

        let ciphertext = self.0.encrypt(nonce, plaintext.as_slice())?;

        Ok(EncryptedData {
            nonce: random_bytes,
            ciphertext,
        })
    }

    pub fn decrypt<T>(&self, encrypted_data: EncryptedData) -> Result<T, ApiError>
    where
        T: DeserializeOwned,
    {
        let nonce = aes_gcm::Nonce::from_slice(&encrypted_data.nonce);

        let plaintext = self.0.decrypt(nonce, encrypted_data.ciphertext.as_ref())?;
        let result: T = serde_json::from_slice(&plaintext)?;

        Ok(result)
    }
}
