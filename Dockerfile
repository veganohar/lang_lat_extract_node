FROM node:18-slim

# Install Python and pip
RUN apt-get update && apt-get install -y python3 python3-pip python3-venv build-essential

# Create and activate a virtual environment
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Upgrade pip and install Python packages
RUN pip install --upgrade pip
RUN pip install numpy ortools

WORKDIR /app

COPY package*.json ./
RUN npm install
COPY . .

EXPOSE 3000
CMD ["npm", "run", "start"]
