//! Kafka event bridge for alias lifecycle events.
use anyhow::Result;
use rdkafka::config::ClientConfig;
use rdkafka::producer::{FutureProducer, FutureRecord};
use std::time::Duration;
use tracing::error;

use crate::{models::AliasEntry, AppState};

const TOPIC_ALIAS_CREATED:   &str = "nexthub.dict.alias.created";
const TOPIC_ALIAS_UPDATED:   &str = "nexthub.dict.alias.updated";
const TOPIC_ALIAS_DELETED:   &str = "nexthub.dict.alias.deleted";
const TOPIC_ALIAS_INVALIDATE: &str = "nexthub.dict.alias.invalidate";

pub struct KafkaBridge {
    producer: FutureProducer,
}

impl KafkaBridge {
    pub fn new(brokers: &str) -> Result<Self> {
        let producer: FutureProducer = ClientConfig::new()
            .set("bootstrap.servers", brokers)
            .set("message.timeout.ms", "5000")
            .set("compression.type", "snappy")
            .set("linger.ms", "5")
            .set("batch.size", "65536")
            .create()?;
        Ok(Self { producer })
    }

    pub async fn publish_alias_created(&self, entry: &AliasEntry) -> Result<()> {
        self.publish(TOPIC_ALIAS_CREATED, &entry.alias_hash, entry).await
    }

    pub async fn publish_alias_updated(&self, entry: &AliasEntry) -> Result<()> {
        self.publish(TOPIC_ALIAS_UPDATED, &entry.alias_hash, entry).await
    }

    pub async fn publish_alias_deleted(&self, alias_value: &str) -> Result<()> {
        let hash = crate::alias::hash_alias(alias_value);
        let payload = serde_json::json!({ "alias_hash": hash, "deleted_at": chrono::Utc::now() });
        self.publish(TOPIC_ALIAS_DELETED, &hash, &payload).await
    }

    async fn publish<T: serde::Serialize>(&self, topic: &str, key: &str, payload: &T) -> Result<()> {
        let value = serde_json::to_string(payload)?;
        let record = FutureRecord::to(topic).key(key).payload(&value);
        self.producer
            .send(record, Duration::from_secs(5))
            .await
            .map_err(|(e, _)| anyhow::anyhow!("kafka publish failed: {:?}", e))?;
        Ok(())
    }
}

/// Run the Kafka consumer for alias invalidation events from other services.
pub async fn run_consumer(state: AppState) -> Result<()> {
    use rdkafka::consumer::{Consumer, StreamConsumer};
    use rdkafka::Message;

    let consumer: StreamConsumer = ClientConfig::new()
        .set("bootstrap.servers", &std::env::var("KAFKA_BROKERS").unwrap_or_else(|_| "kafka:9092".to_string()))
        .set("group.id", "identity-directory-consumer")
        .set("auto.offset.reset", "latest")
        .create()?;

    consumer.subscribe(&[TOPIC_ALIAS_INVALIDATE])?;

    loop {
        match consumer.recv().await {
            Err(e) => error!("kafka.consumer_error: {:?}", e),
            Ok(msg) => {
                if let Some(payload) = msg.payload() {
                    if let Ok(json) = serde_json::from_slice::<serde_json::Value>(payload) {
                        if let Some(hash) = json.get("alias_hash").and_then(|v| v.as_str()) {
                            state.cache.del("dict:alias", hash).await.ok();
                        }
                    }
                }
            }
        }
    }
}
