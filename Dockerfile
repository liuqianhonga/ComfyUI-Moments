FROM python:3.12-slim

WORKDIR /app

# 使用阿里云镜像源
RUN echo \
    deb https://mirrors.aliyun.com/debian/ bookworm main non-free non-free-firmware contrib \
    deb https://mirrors.aliyun.com/debian/ bookworm-updates main non-free non-free-firmware contrib \
    deb https://mirrors.aliyun.com/debian/ bookworm-backports main non-free non-free-firmware contrib \
    deb https://mirrors.aliyun.com/debian-security bookworm-security main non-free non-free-firmware contrib \
    > /etc/apt/sources.list

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    zlib1g-dev \
    libjpeg-dev \
    libpng-dev \
    && rm -rf /var/lib/apt/lists/*

# 使用阿里云的 PyPI 镜像源
RUN pip config set global.index-url https://mirrors.aliyun.com/pypi/simple/ && \
    pip config set install.trusted-host mirrors.aliyun.com

# Copy requirements first to leverage Docker cache
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Expose the port the app runs on
EXPOSE 7860

# Command to run the application
CMD ["python", "app.py", "--listen=0.0.0.0", "--port=7860"]
