#!/bin/bash

WORKING_DIR=$(pwd)
echo "Current directory is: $WORKING_DIR"

LAMBDA_CONFIG_FILE="$CODEBUILD_SRC_DIR/unzip_folder/lambda_function_config.json"

if [ -f "$LAMBDA_CONFIG_FILE" ]; then
    echo "Found lambda configuration file: $LAMBDA_CONFIG_FILE"
else
    echo "Error: lambda configuration file not found: $LAMBDA_CONFIG_FILE"
    exit 1
fi

LAMBDA_CONFIG=$(cat $LAMBDA_CONFIG_FILE)

export AWS_DEFAULT_REGION="ap-northeast-1"

FUNCTION_NAME=$(echo $LAMBDA_CONFIG | jq -r '.FunctionName')
MEMORY_SIZE=$(echo $LAMBDA_CONFIG | jq -r '.MemorySize')
TIMEOUT=$(echo $LAMBDA_CONFIG | jq -r '.Timeout')

REGION=$AWS_DEFAULT_REGION
echo "AWS Region: $REGION"

API_ID=$(aws cloudformation describe-stacks --stack-name Hinagiku-Dev-apigateway --query "Stacks[0].Outputs[?OutputKey=='ApiId'].OutputValue" --output text)
echo "API Gateway ID: $API_ID"

STATEMENT_ID="apigateway-$(date +%Y%m%d%H%M%S)"
echo "Statement ID: ${STATEMENT_ID}"

ACCOUNT_ID=$(aws sts get-caller-identity --query "Account" --output text)
echo "Current AWS Account ID: $ACCOUNT_ID"

SECURITY_GROUP_ID=$(aws ssm get-parameter --name '/Lambda/Lambda-SecurityGroup' --query "Parameter.Value" --output text)
ROLE_ARN=$(aws ssm get-parameter --name '/Lambda/Lambda-Role' --query "Parameter.Value" --output text)
SUBNET_ID=$(aws ssm get-parameter --name "PublicSubnet-0" --query "Parameter.Value" --output text)

echo "Security Group ID: $SECURITY_GROUP_ID"
echo "Role ARN: $ROLE_ARN"
echo "SUBNET_ID : $SUBNET_ID"

ZIP_FILE_PATH="../lambda/lambda_test-package.zip"
if [ ! -f "$ZIP_FILE_PATH" ]; then
    echo "Error: Lambda package zip file not found: $ZIP_FILE_PATH"
    exit 1
fi

if aws lambda get-function --function-name $FUNCTION_NAME >/dev/null 2>&1; then
    echo "Updating existing Lambda function..."
    aws lambda update-function-configuration \
        --function-name $FUNCTION_NAME \
        --handler lambda_test.lambda_handler \
        --memory-size $MEMORY_SIZE \
        --timeout $TIMEOUT \
        --role $ROLE_ARN \
        --vpc-config "SubnetIds=${SUBNET_ID},SecurityGroupIds=${SECURITY_GROUP_ID}" \
        --runtime python3.8
    if [ $? -ne 0 ]; then
        echo "Error: Failed to update Lambda configuration"
        exit 1
    fi
    echo "Lambda configuration updated successfully."
    sleep 30  # 30초 대기
    aws lambda update-function-code \
        --function-name $FUNCTION_NAME \
        --zip-file fileb://$ZIP_FILE_PATH
    if [ $? -ne 0 ]; then
        echo "Error: Failed to update Lambda function code"
        exit 1
    fi
else
    echo "Creating new Lambda function..."
    aws lambda create-function \
        --function-name $FUNCTION_NAME \
        --zip-file fileb://$ZIP_FILE_PATH \
        --handler lambda_test.lambda_handler \
        --role $ROLE_ARN \
        --memory-size $MEMORY_SIZE \
        --timeout $TIMEOUT \
        --runtime python3.8 \
        --vpc-config "SubnetIds=${SUBNET_ID},SecurityGroupIds=${SECURITY_GROUP_ID}"
    if [ $? -ne 0 ]; then
        echo "Error: Failed to create Lambda function"
        exit 1
    fi
fi

check_update_status() {
    local status
    status=$(aws lambda get-function-configuration --function-name $FUNCTION_NAME --query "LastUpdateStatus" --output text)
    echo $status
}

while [[ $(check_update_status) == "InProgress" ]]; do
    echo "Update in progress... Waiting for 10 seconds."
    sleep 10
done

aws lambda add-permission \
    --function-name $FUNCTION_NAME \
    --statement-id $STATEMENT_ID \
    --action lambda:InvokeFunction \
    --principal apigateway.amazonaws.com \
    --source-arn "arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${API_ID}/*"
if [ $? -ne 0 ]; then
    echo "Error: Failed to add permission to Lambda"
    exit 1
fi

INTEGRATION_ID=$(aws apigatewayv2 create-integration \
    --api-id $API_ID \
    --integration-type AWS_PROXY \
    --integration-method ANY \
    --integration-uri $LAMBDA_ARN \
    --payload-format-version 2.0 \
    --query 'IntegrationId' \
    --output text)
if [ $? -ne 0 ]; then
    echo "Error: Failed to create API Gateway integration"
    exit 1
fi
echo "Integration ID: $INTEGRATION_ID"

if ! aws apigatewayv2 get-routes --api-id "$API_ID" --output json | jq -e '.Items[] | select(.RouteKey == "ANY /{proxy+}")' >/dev/null; then
    aws apigatewayv2 create-stage \
        --api-id $API_ID \
        --stage-name dev \
        --auto-deploy true \
        --region $REGION
    if [ $? -ne 0 ]; then
        echo "Error: Failed to create API Gateway stage"
        exit 1
    fi
fi

if ! aws apigatewayv2 get-routes --api-id "$API_ID" --output json | jq -e '.Items[] | select(.RouteKey == "ANY /{proxy+}")' >/dev/null; then
    aws apigatewayv2 update-stage --api-id $API_ID --stage-name dev --auto-deploy true --region $REGION
    if [ $? -ne 0 ]; then
        echo "Error: Failed to update API Gateway stage"
        exit 1
    fi
fi
