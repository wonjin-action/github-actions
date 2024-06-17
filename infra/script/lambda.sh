#!/bin/bash

WORKING_DIR=$(pwd)
echo "Current directory is: $WORKING_DIR"

# 환경 변수 및 SSM 파라미터 설정
SECURITY_GROUP_ID=$(aws ssm get-parameter --name '/Lambda/Lambda-SecurityGroup' --query "Parameter.Value" --output text)
ROLE_ARN=$(aws ssm get-parameter --name '/Lambda/Lambda-Role' --query "Parameter.Value" --output text)
NAME_SPACE_ID=$(aws ssm get-parameter --name '/Lambda/namespace' --query "Parameter.Value" --output text)
SERVICE_ID=$(aws ssm get-parameter --name '/Lambda/serviceId' --query "Parameter.Value" --output text)
INSTANCE_ID='Lambda_App'
SUBNET_ID=$(aws ssm get-parameter --name "PublicSubnet-0" --query "Parameter.Value" --output text)

echo "Security Group ID: $SECURITY_GROUP_ID"
echo "Role ARN: $ROLE_ARN"
echo "SUBNET_ID: $SUBNET_ID"

LAMBDA_CONFIG_FILE="$CODEBUILD_SRC_DIR/unzip_folder/lambda_function_config.json"
DOCKER_INFO="$CODEBUILD_SRC_DIR/unzip_folder/docker_image_info.json"

if [ -f "$LAMBDA_CONFIG_FILE" ]; then
    echo "Found lambda configuration file: $LAMBDA_CONFIG_FILE"
else
    echo "Error: lambda configuration file not found: $LAMBDA_CONFIG_FILE"
    exit 1
fi

LAMBDA_CONFIG=$(cat $LAMBDA_CONFIG_FILE)

# 환경 변수 설정
export AWS_DEFAULT_REGION="ap-northeast-1"

# JSON 구성에서 값 추출
FUNCTION_NAME=$(echo $LAMBDA_CONFIG | jq -r '.FunctionName')
MEMORY_SIZE=$(echo $LAMBDA_CONFIG | jq -r '.MemorySize')
TIMEOUT=$(echo $LAMBDA_CONFIG | jq -r '.Timeout')

# Docker 이미지 정보 가져오기
REPO_URL=$(jq -r '.DOCKER_IMAGE_URL' $DOCKER_INFO)
TAG=$(jq -r '.TAG' $DOCKER_INFO)

echo "docker image url: ${REPO_URL}"
echo "Image tag: ${TAG}"

REGION=$AWS_DEFAULT_REGION
echo "AWS Region: $REGION"

API_ID=$(aws cloudformation describe-stacks --stack-name Hinagiku-Dev-apigateway --query "Stacks[0].Outputs[?OutputKey=='ApiId'].OutputValue" --output text)
echo "API Gateway ID: $API_ID"

STATEMENT_ID="apigateway-$(date +%Y%m%d%H%M%S)"
echo "Statement ID: ${STATEMENT_ID}"

ACCOUNT_ID=$(aws sts get-caller-identity --query "Account" --output text)
echo "Current AWS Account ID: $ACCOUNT_ID"

ROLE_NAME="lambda-execution-role"
if ! ROLE_ARN=$(aws iam get-role --role-name $ROLE_NAME --query 'Role.Arn' --output text 2>/dev/null); then
    ROLE_ARN=$(aws iam create-role \
        --role-name $ROLE_NAME \
        --assume-role-policy-document file://$CODEBUILD_SRC_DIR/unzip_folder/trust_policy_for_lambda.json \
        --query 'Role.Arn' \
        --output text)
    echo "Created new IAM Role: $ROLE_NAME"
else
    echo "Using existing IAM Role: $ROLE_NAME"
fi

LAMBDA_ARN=$(aws lambda get-function --function-name $FUNCTION_NAME --query 'Configuration.FunctionArn' --output text)

aws iam attach-role-policy --role-name lambda-execution-role --policy-arn arn:aws:iam::aws:policy/IAMFullAccess
aws iam attach-role-policy --role-name lambda-execution-role --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly
aws iam attach-role-policy --role-name lambda-execution-role --policy-arn arn:aws:iam::aws:policy/AmazonAPIGatewayAdministrator

aws lambda add-permission \
    --function-name $FUNCTION_NAME \
    --statement-id $STATEMENT_ID \
    --action lambda:InvokeFunction \
    --principal apigateway.amazonaws.com \
    --source-arn "arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${API_ID}/*"

if aws lambda get-function --function-name $FUNCTION_NAME >/dev/null 2>&1; then
    echo "Updating existing Lambda function..."
    aws lambda update-function-configuration \
        --function-name $FUNCTION_NAME \
        --memory-size $MEMORY_SIZE \
        --timeout $TIMEOUT \
        --role "arn:aws:iam::${ACCOUNT_ID}:role/lambda-execution-role" \
        --vpc-config SubnetIds=$SUBNET_ID,SecurityGroupIds=$SECURITY_GROUP_ID
    echo "Lambda configuration updated successfully."
    sleep 30  # 30초 대기
    aws lambda update-function-code \
        --function-name $FUNCTION_NAME \
        --image-uri "${REPO_URL}:${TAG}"
else
    echo "Creating new Lambda function..."
    aws lambda create-function \
        --function-name $FUNCTION_NAME \
        --package-type Image \
        --code ImageUri="${REPO_URL}:${TAG}" \
        --role "arn:aws:iam::${ACCOUNT_ID}:role/lambda-execution-role" \
        --memory-size $MEMORY_SIZE \
        --timeout $TIMEOUT \
        --vpc-config SubnetIds=$SUBNET_ID,SecurityGroupIds=$SECURITY_GROUP_ID
fi

aws servicediscovery create-service \
    --name myservice \
    --namespace-id ${NAME_SPACE_ID} \
    --dns-config "NamespaceId=${NAME_SPACE_ID},RoutingPolicy=MULTIVALUE,DnsRecords=[{Type=A,TTL=60}]"

aws servicediscovery register-instance \
    --service-id ${SERVICE_ID} \
    --instance-id $INSTANCE_ID \
    --attributes "AWS_INSTANCE_IPV4=172.2.1.3,AWS_INSTANCE_PORT=8080"
