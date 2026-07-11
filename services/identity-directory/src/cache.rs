//! Redis L1 cache for alias resolution.
use anyhow::Result;
use redis::{aio::ConnectionManager, AsyncCommands, Client};
use serde::{de::DeserializeOwned, Serialize};

pub struct RedisCache {
    conn: ConnectionManager,
}

impl RedisCache {
    pub async fn connect(url: &str) -> Result<Self> {
        let client = Client::open(url)?;
        let conn = ConnectionManager::new(client).await?;
        Ok(Self { conn })
    }

    pub async fn get<T: DeserializeOwned>(&self, ns: &str, key: &str) -> Result<Option<T>> {
        let mut conn = self.conn.clone();
        let full_key = format!("{}:{}", ns, key);
        let raw: Option<String> = conn.get(&full_key).await?;
        match raw {
            None => Ok(None),
            Some(s) => Ok(Some(serde_json::from_str(&s)?)),
        }
    }

    pub async fn set<T: Serialize>(&self, ns: &str, key: &str, value: &T, ttl_secs: u64) -> Result<()> {
        let mut conn = self.conn.clone();
        let full_key = format!("{}:{}", ns, key);
        let serialized = serde_json::to_string(value)?;
        conn.set_ex::<_, _, ()>(&full_key, serialized, ttl_secs).await?;
        Ok(())
    }

    pub async fn del(&self, ns: &str, key: &str) -> Result<()> {
        let mut conn = self.conn.clone();
        let full_key = format!("{}:{}", ns, key);
        conn.del::<_, ()>(&full_key).await?;
        Ok(())
    }
}
