# Use Ubuntu as base image
FROM ubuntu:latest

# Set environment variables
ENV PLATFORM=LINUX
ENV DEFAULT_DIR=/
ENV REPOSITORY_ROOT_PATH=/
ENV OUTPUT_ROOT_PATH=/
ENV MOUNT_PATH=/mount

# Install Python 3.12 and required dependencies
RUN apt-get update && apt-get install -y \
    software-properties-common \
    && add-apt-repository ppa:deadsnakes/ppa \
    && apt-get update \
    && apt-get install -y \
    python3.12 \
    python3.12-venv \
    python3.12-dev \
    gnuplot \
    git \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy project files
COPY requirements.txt .
COPY src/ .

# Create and activate virtual environment
RUN python3.12 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Expose port
EXPOSE 5000

# Run app.py directly with Python
ENTRYPOINT ["python3.12", "app.py"]