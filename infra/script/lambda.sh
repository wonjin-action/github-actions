#!/bin/bash

WORKING_DIR=$(pwd)
echo "Current directory is: $WORKING_DIR"
# Load the configuration from the JSON file

<< 'END' 

< If you start a script locally > 

# LAMBDA_CONFIG_FILE="$CODEBUILD_SRC_DIR/infra/lambda/lamda_function_config.json"

END


LAMBDA_CONFIG_FILE="$CODEBUILD_SRC_DIR/unzip_folder/lambda_function_config.json"


DOCKER_INFO="$CODEBUILD_SRC_DIR/unzip_folder/docker_image_info.json"

if [ -f "$LAMBDA_CONFIG_FILE" ]; then
    echo "Found lambda configuration file: $LAMBDA_CONFIG_FILE"
else
    echo "Error: lambda configuration file not found: $LAMBDA_CONFIG_FILE"
    exit 1
fi


LAMBDA_CONFIG=$(cat LAMBDA_CONFIG_FILE)


# Extract values from the JSON configuration
FUNCTION_NAME=$(echo $LAMBDA_CONFIG | jq -r '.FunctionName')
MEMORY_SIZE=$(echo $LAMBDA_CONFIG | jq -r '.MemorySize')
TIMEOUT=$(echo $LAMBDA_CONFIG | jq -r '.Timeout')

# Import Docker Info for Iambda Backend 

source ./lambda/docker_image_info.txt

DOCKER_IMAGE_URL=$(jq -r '.DOCKER_IMAGE_URL' $DOCKER_INFO)
TAG=$(jq -r '.TAG' $DOCKER_INFO)

echo "docker image url : ${DOCKER_IMAGE_URL}"
echo "Image tag is ${TAG}"

# 동적으로 가져오기 -> 사용자에게 값을 입력받지 않는다.
REGION=$(aws configure get region)

# ECR Repository Name 조회
REPO_NAME=$(aws ssm get-parameter --name "/Hinagiku/Repository/${FUNCTION_NAME}" --query "Parameter.Value" --output text)

echo "AWS Region: $REGION"
echo "Repository Name: $REPO_NAME"

API_ID=$(aws cloudformation describe-stacks --stack-name Hinagiku-Dev-apigateway --query "Stacks[0].Outputs[?OutputKey=='ApiId'].OutputValue" --output text)
echo "API Gateway ID: $API_ID"

STATEMENT_ID="apigateway-$(date +%Y%m%d%H%M%S)"

echo "Statement ID: ${STATEMENT_ID}"

# 현재 AWS 계정 ID 가져오기
ACCOUNT_ID=$(aws sts get-caller-identity --query "Account" --output text)
echo "Current AWS Account ID: $ACCOUNT_ID"

# IAM 역할 생성 또는 사용
ROLE_NAME="lambda-execution-role"
ROLE_ARN=""
if ! ROLE_ARN=$(aws iam get-role --role-name $ROLE_NAME --query 'Role.Arn' --output text 2>/dev/null); then
    ROLE_ARN=$(aws iam create-role \
    --role-name $ROLE_NAME \
    --assume-role-policy-document file://trust_policy_for_lambda.json \
    --query 'Role.Arn' \
    --output text)
    echo "Created new IAM Role: $ROLE_NAME"
else
    echo "Using existing IAM Role: $ROLE_NAME"
fi

# Lambda 함수 ARN 생성
LAMBDA_ARN=$(aws lambda get-function --function-name $FUNCTION_NAME --query 'Configuration.FunctionArn' --output text)

# Allow API Gateway for invoking lambda (Resource-based Policy)
aws lambda add-permission \
    --function-name $FUNCTION_NAME \
    --statement-id $STATEMENT_ID \
    --action lambda:InvokeFunction \
    --principal apigateway.amazonaws.com \
    --source-arn "arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${API_ID}/*"
echo $(aws apigatewayv2 get-api --api-id "$API_ID" --query 'Arn' --output text)

# Integration Lambda with API Gateway
aws apigatewayv2 create-integration \
    --api-id $API_ID \
    --integration-type AWS_PROXY \
    --integration-method ANY \
    --integration-uri $LAMBDA_ARN \
    --payload-format-version 2.0

INTEGRATION_ID=$(aws apigatewayv2 create-integration \
    --api-id $API_ID \
    --integration-type AWS_PROXY \
    --integration-method ANY \
    --integration-uri $LAMBDA_ARN \
    --payload-format-version 2.0 \
    --query 'IntegrationId' \
    --output text)
echo "Integration ID: $INTEGRATION_ID"

# Create API Gateway route
if ! aws apigatewayv2 get-routes --api-id "$API_ID" --output json | jq -e '.Items[] | select(.RouteKey == "ANY /{proxy+}")' >/dev/null; then
    aws apigatewayv2 create-stage \
    --api-id $API_ID \
    --stage-name dev \
    --auto-deploy true
fi

if ! aws apigatewayv2 get-routes --api-id "$API_ID" --output json | jq -e '.Items[] | select(.RouteKey == "ANY /{proxy+}")' >/dev/null; then
    aws apigatewayv2 update-stage --api-id $API_ID --stage-name dev --auto-deploy true
fi

# Attach permission to IAM Role
aws iam attach-role-policy \
--role-name lambda-execution-role \
--policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryFullAccess

# Lambda 함수 생성 또는 업데이트
if aws lambda get-function --function-name $FUNCTION_NAME >/dev/null 2>&1; then
    echo "Updating existing Lambda function...";
    aws lambda update-function-configuration \
    --function-name $FUNCTION_NAME \
    --memory-size $MEMORY_SIZE \
    --timeout $TIMEOUT \
    --role "arn:aws:iam::${ACCOUNT_ID}:role/lambda-execution-role"
    echo "Lambda configuration updated successfully."
    sleep 30  # 30초 대기
    aws lambda update-function-code \
    --function-name $FUNCTION_NAME \
    --image-uri "${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${DOCKER_IMAGE_URL}:${TAG}"
else
    echo "Creating new Lambda function..."
    aws lambda create-function \
    --function-name $FUNCTION_NAME \
    --package-type Image \
    --code ImageUri="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${DOCKER_IMAGE_URL}:${TAG}" \
    --role "arn:aws:iam::${ACCOUNT_ID}:role/lambda-execution-role" \
    --memory-size $MEMORY_SIZE \
    --timeout $TIMEOUT
fi

# 환경 변수 설정
# aws lambda update-function-configuration \
# --function-name $FUNCTION_NAME \
# --environment "Variables={REGION=\"${REGION}\",REPO_NAME=\"${REPO_NAME}\"}"
