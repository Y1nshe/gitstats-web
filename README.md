# Git Statistics Generator

A web application for generating Git repository statistics using Docker.

## Prerequisites

- Docker
- Docker Compose

## Quick Start

1. Clone the repository:
```bash
git clone https://github.com/Y1nshe/gitstats-web.git
cd gitstats
```

2. Build and run the container:
```bash
docker compose up --build
```

3. Access the application:
Open your browser and navigate to `http://localhost:5000`

## Configuration

The application can be configured through environment variables in `docker-compose.yml`:

```yaml
environment:
  - PLATFORM=WINDOWS        # Platform type (WINDOWS or LINUX)
  - REPOSITORY_ROOT_PATH=/  # Root path for repository browsing
  - OUTPUT_ROOT_PATH=/      # Root path for output files
  - MOUNT_PATH=/mount      # Mount point for host filesystem
volumes:
  - /:/mount:rw           # Mount host filesystem
```

### Container Mounting

The application mounts the entire host filesystem to `/mount` inside the container:
- This allows browsing and accessing files on your host machine
- The mount is read-write (`:rw`), allowing generation of statistics reports
- All paths in the application are relative to this mount point

### Windows Platform Solution

For Windows users, the standard configuration is:
```yaml
environment:
  - PLATFORM=WINDOWS
  - REPOSITORY_ROOT_PATH=/mnt/host
  - OUTPUT_ROOT_PATH=/mnt/host
  - MOUNT_PATH=/mount
volumes:
  - /:/mount:rw
```

This is the standard configuration because:
1. `REPOSITORY_ROOT_PATH=/mnt/host` and `OUTPUT_ROOT_PATH=/mnt/host`:
   - Provides access to the entire host filesystem
   - Works consistently across different Windows versions
   - Maintains compatibility with Docker's WSL2 backend
2. The application will automatically:
   - Convert Windows paths (e.g., `C:\Users\Projects`) to Linux format (`/mnt/host/c/Users/Projects`)
   - Display paths in Windows format in the UI
   - Handle path conversions internally

### Environment Variables

1. `PLATFORM`
   - Purpose: Specifies the operating system platform
   - Values: `WINDOWS` or `LINUX`
   - Default: `LINUX`
   - Note: Affects how paths are displayed and handled in the UI

2. `REPOSITORY_ROOT_PATH`
   - Purpose: Defines the root directory for browsing Git repositories
   - Default: `/`
   - Note: This path should be relative to the mounted host filesystem

3. `OUTPUT_ROOT_PATH`
   - Purpose: Specifies where generated statistics reports will be saved
   - Default: `/`
   - Note: This path should be relative to the mounted host filesystem

4. `MOUNT_PATH`
   - Purpose: Sets the mount point for accessing host filesystem
   - Default: `/mount`
   - Note: This is the base path where the host filesystem is mounted inside the container

## Troubleshooting

1. If the container fails to start:
   - Check if port 5000 is available
   - Ensure Docker has necessary permissions
   - Check container logs: `docker compose logs`

2. If file access fails:
   - Verify mount permissions
   - Check if paths are correctly formatted for your platform
   - Ensure Docker has access to the mounted directories

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.