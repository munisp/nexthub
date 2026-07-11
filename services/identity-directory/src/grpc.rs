//! gRPC server for high-throughput internal alias resolution.
//! Used by the NIP gateway and the integration API for sub-millisecond lookups.
use anyhow::Result;
use std::net::SocketAddr;
use tonic::{transport::Server, Request, Response, Status};
use tracing::info;

use crate::AppState;

/// Minimal gRPC health check service (grpc.health.v1)
pub mod health {
    tonic::include_proto!("grpc.health.v1");
}

pub struct HealthService;

#[tonic::async_trait]
impl health::health_server::Health for HealthService {
    async fn check(
        &self,
        _req: Request<health::HealthCheckRequest>,
    ) -> Result<Response<health::HealthCheckResponse>, Status> {
        Ok(Response::new(health::HealthCheckResponse {
            status: health::health_check_response::ServingStatus::Serving as i32,
        }))
    }

    type WatchStream = tokio_stream::wrappers::ReceiverStream<Result<health::HealthCheckResponse, Status>>;

    async fn watch(
        &self,
        _req: Request<health::HealthCheckRequest>,
    ) -> Result<Response<Self::WatchStream>, Status> {
        Err(Status::unimplemented("watch not implemented"))
    }
}

pub async fn run_grpc_server(_state: AppState, port: u16) -> Result<()> {
    let addr: SocketAddr = format!("0.0.0.0:{}", port).parse()?;
    info!("identity_directory.grpc_listening addr={}", addr);

    Server::builder()
        .add_service(health::health_server::HealthServer::new(HealthService))
        .serve(addr)
        .await?;

    Ok(())
}
