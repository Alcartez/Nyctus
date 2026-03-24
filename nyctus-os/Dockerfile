# ── NyctusOS ───────────────────────────────────────────────────────────────────
#
# Minimal Debian bookworm base + micromamba for Nyctus pipeline containers.
# Pipeline nodes use micromamba to create isolated conda envs at runtime.
#
# Build:
#   podman build -t nyctus-os:latest -f nyctus-os/Dockerfile .
#
# Push to GHCR:
#   podman tag nyctus-os:latest ghcr.io/YOUR_GITHUB_USER/nyctus-os:latest
#   podman push ghcr.io/YOUR_GITHUB_USER/nyctus-os:latest
#
# ─────────────────────────────────────────────────────────────────────────────

FROM debian:bookworm-slim

ENV MAMBA_ROOT_PREFIX=/opt/conda
ENV PATH="${MAMBA_ROOT_PREFIX}/bin:${PATH}"

RUN set -eux && \
    apt-get update -qq && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        tini curl ca-certificates bash bzip2 procps && \
    \
    # Install micromamba binary
    curl -Ls https://micro.mamba.pm/api/micromamba/linux-64/latest \
        | tar -xvj -C /usr/local/bin --strip-components=1 bin/micromamba && \
    \
    # Initialise conda root prefix — channels left open for pipeline developers
    micromamba shell init -s bash -r /opt/conda && \
    micromamba config set always_yes true && \
    \
    # Clean up
    rm -rf \
        /usr/share/doc/* \
        /usr/share/man/* \
        /var/cache/apt/* \
        /var/lib/apt/lists/*

LABEL org.opencontainers.image.title="NyctusOS"
LABEL org.opencontainers.image.description="Minimal Debian + micromamba base"
LABEL org.opencontainers.image.licenses="AGPL-3.0"

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/bin/bash"]
