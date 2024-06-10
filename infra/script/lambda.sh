#!/bin/bash

WORKING_DIR=$(pwd)
echo "Current directory is: $WORKING_DIR"
# Load the configuration from the JSON file

<< 'END'

< If you start a script locally >

# LAMBDA_CONFIG_FILE="$CODEBUILD_SRC_DIR/infra/lambda/lambda_function_config.json"

END

# Setting Permission for CodeBuild




# 역할에 연결된 정책 확인
# aws iam list-attached-role-policies --role-name CodeBuildServiceRole

# 특정 정책의 내용 확인 (인라인 정책인 경우)
# aws iam get-role-policy --role-name CodeBuildServiceRole --policy-name CodeBuildServiceRolePolicy


# aws iam create-role \
#     --role-name lambda-execution-role \
#     --assume-role-policy-document file://$CODEBUILD_SRC_DIR/unzip_folder/trust-policy-codebuild.json


# aws iam attach-role-policy \
#     --role-name CodeBuildServiceRole \
#     --policy-arn arn:aws:iam::019817421975:policy/








SECURITY_GROUP_ID=$(aws ssm get-parameter --name '/Lambda/Lambda-SecurityGroup' --query "Parameter.Value" --output text )
ROLE_ARN=$(aws ssm get-parameter --name '/Lambda/Lambda-Role' --query "Parameter.Value" --output text )
NAME_SPACE_ID=$(aws ssm get-parameter --name '/Lambda/namespace' --query "Parameter.Value" --output text)
SERVICE_ID=$(aws ssm get-parameter --name '/Lambda/serviceId' --query "Parameter.Value" --output text)
INSTANCE_ID='Lambda_App'
SUBNET_ID=$(aws ssm get-parameter --name "/PublicSubnet-0" --query "Parameter.Value" --output text)

echo "VPC ID: $VPC_ID"
echo "Security Group ID: $SECURITY_GROUP_ID"
echo "Role ARN: $ROLE_ARN"


# aws iam put-role-policy --role-name CodeBuildServiceRole --policy-name CodeBuildServiceRolePolicy --policy-document file://$CODEBUILD_SRC_DIR/unzip_folder/create-role-codebuild.json

LAMBDA_CONFIG_FILE="$CODEBUILD_SRC_DIR/unzip_folder/lambda_function_config.json"


DOCKER_INFO="$CODEBUILD_SRC_DIR/unzip_folder/docker_image_info.json"

if [ -f "$LAMBDA_CONFIG_FILE" ]; then
    echo "Found lambda configuration file: $LAMBDA_CONFIG_FILE"
else
    echo "Error: lambda configuration file not found: $LAMBDA_CONFIG_FILE"
    exit 1
fi


LAMBDA_CONFIG=$(cat $LAMBDA_CONFIG_FILE)

# Configure Enivironment Variable

export AWS_DEFAULT_REGION="ap-northeast-1"

# Extract values from the JSON configuration
FUNCTION_NAME=$(echo $LAMBDA_CONFIG | jq -r '.FunctionName')
MEMORY_SIZE=$(echo $LAMBDA_CONFIG | jq -r '.MemorySize')
TIMEOUT=$(echo $LAMBDA_CONFIG | jq -r '.Timeout')

# Import Docker Info for Iambda Backend

REPO_URL=$(jq -r '.DOCKER_IMAGE_URL' $DOCKER_INFO)
TAG=$(jq -r '.TAG' $DOCKER_INFO)

echo "docker image url : ${REPO_URL}"
echo "Image tag is ${TAG}"

# 동적으로 가져오기 -> 사용자에게 값을 입력받지 않는다.
# REGION=$(aws configure get region --region ap-northeast-1)

REGION=$AWS_DEFAULT_REGION


echo "AWS Region: $REGION"
# echo "Repository Name: $REPO_NAME"

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
    --assume-role-policy-document file://$CODEBUILD_SRC_DIR/unzip_folder/trust_policy_for_lambda.json \
    --query 'Role.Arn' \
    --output text)
    echo "Created new IAM Role: $ROLE_NAME"
else
    echo "Using existing IAM Role: $ROLE_NAME"
fi

# Lambda 함수 ARN 생성
LAMBDA_ARN=$(aws lambda get-function --function-name $FUNCTION_NAME --query 'Configuration.FunctionArn' --output text)




# Attach permission to IAM Role - AWS Managed Policy

aws iam attach-role-policy \
--role-name lambda-execution-role \
--policy-arn arn:aws:iam::aws:policy/IAMFullAccess


aws iam attach-role-policy \
--role-name lambda-execution-role \
--policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly


aws iam attach-role-policy \
--role-name lambda-execution-role \
--policy-arn arn:aws:iam::aws:policy/AmazonAPIGatewayAdministrator

# If you want to create a user-managed policy


REPO_NAME=$(echo $REPO_URL | awk -F'/' '{print $2}')
          echo "Repository Name: $REPO_NAME"


# aws ecr set-repository-policy \
#     --repository-name ${REPO_NAME} \
#     --policy-text "$ECR_POLICY"

# # aws ecr set-repository-policy \
#     --repository-name <repository-name> \
#     --policy-text file://path/to/ecr-policy.json


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
    --output text \
    --region $REGION)
echo "Integration ID: $INTEGRATION_ID"

# Create API Gateway route
if ! aws apigatewayv2 get-routes --api-id "$API_ID" --output json | jq -e '.Items[] | select(.RouteKey == "ANY /{proxy+}")' >/dev/null; then
    aws apigatewayv2 create-stage \
    --api-id $API_ID \
    --stage-name dev \
    --auto-deploy true \
    --region $REGION
fi

if ! aws apigatewayv2 get-routes --api-id "$API_ID" --output json | jq -e '.Items[] | select(.RouteKey == "ANY /{proxy+}")' >/dev/null; then
    aws apigatewayv2 update-stage --api-id $API_ID --stage-name dev --auto-deploy true --region $REGION
fi



# Lambda 함수 생성 또는 업데이트
if aws lambda get-function --function-name $FUNCTION_NAME >/dev/null 2>&1; then
    echo "Updating existing Lambda function...";
    aws lambda update-function-configuration \
    --function-name $FUNCTION_NAME \
    --memory-size $MEMORY_SIZE \
    --timeout $TIMEOUT \
    --role "arn:aws:iam::${ACCOUNT_ID}:role/lambda-execution-role" \
    --region $REGION
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
    --timeout $TIMEOUT
    --vpc-config SubnetIds=$SUBNET_ID,SecurityGroupIds=$SECURITY_GROUP_ID

fi

### Api Gateway의 엔드포인트를 CloudMap의 서비스 인스턴스로 등록

# import Value from SSM




aws servicediscovery create-service \
    --name myservice \
    --namespace-id  ${namespace} \
    --dns-config "NamespaceId=${NAME_SPACE_ID},RoutingPolicy=MULTIVALUE,DnsRecords=[{Type=A,TTL=60}]"

aws servicediscovery register-instance \
    --service-id ${SERVICE_ID} \
    --instance-id $INSTANCE_ID \
    --attributes=AWS_INSTANCE_IPV4=172.2.1.3,AWS_INSTANCE_PORT=8080 # attribute 플래그를 사용하여 특정 서비스 인스턴스를 클라우드 맵에 등록하는데 사용

<< 'END'
    # 인스턴스 포트 8080으로 설정하는것은 해당 서비스 인스턴스가 트래픽을 수신할 포트 번호를 지정한다.
    # 일반적으로 포트 8080은 HTTP 트래픽을 위한 대체 포트로 사용되며, 기본 HTTP 포트인 80과 같은 역할을 수행한다.
    # 이 설정은 API 게이트웨이 엔드포인트가 람다 함수를 호출할 때 사용되는 내부 네트워크 설정의 일부
    # 포트 번호를 8080으로 설정함으로써, CloudMap은 이 포트에서 들어오는 트래픽을 해당 Lambda 함수로 라우팅하도록 구성

END


# 환경 변수 설정
# aws lambda update-function-configuration \
# --function-name $FUNCTION_NAME \
# --environment "Variables={REGION=\"${REGION}\",REPO_NAME=\"${REPO_NAME}\"}"
