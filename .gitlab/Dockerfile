FROM registry.ddbuild.io/images/docker:24.0.5

RUN apt-get update && apt-get install -y --fix-missing --no-install-recommends \
  curl gcc gnupg g++ make cmake unzip openssl g++ uuid-runtime xxd ca-certificates

# Install NodeJS 18.x
RUN mkdir -p /etc/apt/keyrings
RUN curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
RUN echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_18.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list
RUN apt-get update && apt-get install -y nodejs

# Install Yarn, TypeScript, and Serverless globally.
# Pin Serverless 3.39.0: newer 3.x releases require Node >= 20 via @aws-sdk/client-lambda.
RUN npm install --global yarn typescript serverless@3.39.0

# Install AWS CLI
RUN curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
RUN unzip awscliv2.zip && ./aws/install
