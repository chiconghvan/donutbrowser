#!/bin/bash
set -e

# Ensure cargo/rustc are on PATH (pnpm's bash on Windows may not inherit it)
if ! command -v cargo &>/dev/null; then
  # Try standard cargo locations
  for cargo_dir in \
    "$HOME/.cargo/bin" \
    "/c/Users/$USER/.cargo/bin" \
    "/mnt/c/Users/$USER/.cargo/bin"; do
    if [[ -d "$cargo_dir" ]] && [[ -e "$cargo_dir/cargo" || -e "$cargo_dir/cargo.exe" ]]; then
      export PATH="$cargo_dir:$PATH"
      break
    fi
  done
  # Try USERPROFILE (Windows env var with backslashes)
  if ! command -v cargo &>/dev/null && [[ -n "$USERPROFILE" ]]; then
    CARGO_DIR="$(cd "$USERPROFILE/.cargo/bin" 2>/dev/null && pwd)"
    if [[ -n "$CARGO_DIR" ]]; then
      export PATH="$CARGO_DIR:$PATH"
    fi
  fi
  if ! command -v cargo &>/dev/null; then
    echo "Error: cargo not found. Please ensure Rust is installed and cargo is on your PATH."
    echo "  Install Rust: https://rustup.rs"
    exit 1
  fi
fi

# Get the target triple from environment or use default
TARGET="${TARGET:-${TAURI_ENV_TARGET_TRIPLE:-$(rustc -vV 2>/dev/null | sed -n 's|host: ||p' || echo unknown)}}"
MANIFEST_DIR="$(dirname "$0")"
PROFILE_DIR="debug"
if [[ "${PROFILE:-debug}" == "release" ]]; then
  PROFILE_DIR="release"
fi

# Cargo writes to target/<triple>/<profile> whenever --target is passed,
# even when the target triple equals the host triple.
EXPLICIT_TARGET=false
if [[ -n "${TARGET:-}" || -n "${TAURI_ENV_TARGET_TRIPLE:-}" ]]; then
  EXPLICIT_TARGET=true
fi

DEST_DIR="$MANIFEST_DIR/binaries"
# Create binaries directory if it doesn't exist
mkdir -p "$DEST_DIR"

# Function to copy a binary
copy_binary() {
  local BIN_BASE_NAME="$1"

  # Determine binary name based on target
  if [[ "$TARGET" == *"windows"* ]]; then
    BIN_NAME="${BIN_BASE_NAME}.exe"
  else
    BIN_NAME="$BIN_BASE_NAME"
  fi

  SOURCE=""
  SOURCE_CANDIDATES=()
  if [[ "$TARGET" != "unknown" ]]; then
    SOURCE_CANDIDATES+=("$MANIFEST_DIR/target/$TARGET/$PROFILE_DIR/$BIN_NAME")
  fi
  SOURCE_CANDIDATES+=("$MANIFEST_DIR/target/$PROFILE_DIR/$BIN_NAME")

  for candidate in "${SOURCE_CANDIDATES[@]}"; do
    if [[ -f "$candidate" ]]; then
      SOURCE="$candidate"
      break
    fi
  done

  # Tauri expects the format: binary-{target} with hyphens
  DEST_NAME="${BIN_BASE_NAME}-$TARGET"
  if [[ "$TARGET" == *"windows"* ]]; then
    DEST_NAME="$DEST_NAME.exe"
  fi
  DEST="$DEST_DIR/$DEST_NAME"

  # Copy the binary if it exists
  if [[ -n "$SOURCE" ]]; then
    if [[ "${PROFILE:-debug}" == "release" && ! -s "$SOURCE" ]]; then
      echo "Error: Release sidecar is empty: $SOURCE"
      exit 1
    fi
    cp "$SOURCE" "$DEST"
    echo "Copied $BIN_NAME to $DEST"
  else
    rm -f "$DEST"
    echo "Warning: Binary not found. Checked:"
    printf '  - %s\n' "${SOURCE_CANDIDATES[@]}"

    if [[ "${PROFILE:-debug}" == "release" ]]; then
      echo "Error: Release build requires a real $BIN_BASE_NAME sidecar."
      exit 1
    fi

    echo "Building $BIN_BASE_NAME binary..."
    cd "$MANIFEST_DIR"
    BUILD_ARGS=("build" "--bin" "$BIN_BASE_NAME")
    if [[ -n "$PROFILE" ]] && [[ "$PROFILE" == "release" ]]; then
      BUILD_ARGS+=("--release")
    fi
    if [[ "$EXPLICIT_TARGET" == true && -n "$TARGET" && "$TARGET" != "unknown" ]]; then
      BUILD_ARGS+=("--target" "$TARGET")
    fi
    cargo "${BUILD_ARGS[@]}"

    SOURCE=""
    for candidate in "${SOURCE_CANDIDATES[@]}"; do
      if [[ -f "$candidate" ]]; then
        SOURCE="$candidate"
        break
      fi
    done

    if [[ -n "$SOURCE" ]]; then
      cp "$SOURCE" "$DEST"
      echo "Built and copied $BIN_NAME to $DEST"
    else
      echo "Error: Failed to build $BIN_BASE_NAME binary"
      exit 1
    fi
  fi
}

# Copy donut-proxy binary
copy_binary "donut-proxy"

