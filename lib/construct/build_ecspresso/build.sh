"""
도커 파일을 사용하여, 도커 이미지를 빌드하고, 배포하기 위한 자동화 파일 

1. bash.sh 파일 안에 환경 변수 설정 
- ( aws 계정 , 리전 등 설정 )을 설정 한다.
2. ECR 로그인 
- AWS ECR에 로그인 하는 명령어를 실행하여, 도커 클라이언트가 ECR 리포지토리에 접근할 수 있도록 한다. 
3. 도커 이미지 빌드 
- 도커 파일을 사용하여 도커 이미지를 빌드한다. 이때, 이미지 태그에는 빌드 번호나 커밋 해시와 같은 고유 식별자를 포함시키는 것이 좋다.
4. 도커 이미지 ECR에 푸시 ( 선택 사항 )
- ECR에 새 이미지가 푸시되면. ECS 서비스를 업데이트 하여 새 이미지를 사용하도록 설정할 수 있다.
- 이 과정은 ECS 서비스의 태스크 정의를 새 이미지로 업데이트하는 것을 포함할 수 있다. 


"""

#!/bin/bash

# < 환경 변수 설정 > 
AWS_DEFAULT_REGION="ap-northeast-1"
# Front or Back
FRONT_OR_BACK="Front"
# Blue/Greenの場合は"Bg",Rollingの場合は""(空文字)
BG=""
SCRIPT_DIR=$(cd $(dirname $0); pwd) # 스크립트가 위치한 절대 경로를 사용한다. 

# 환경을 인자로 제공해야 함을 요구 한다. ( dev , stag , prod )
# 즉 , bash build.sh dev 와 같이 
if [ -z "${1}" ]; then
  echo "Please set a argument such as dev/stg/prod"
  exit 1
fi

echo "Your environment is ${1}" # 만약 ,dev라면, 
if [ -f "${SCRIPT_DIR}/${1}.conf" ]; then # 스크립가 존재하는 경로에 dev.conf 파일을 들고와서 환경 설정 
  . "${SCRIPT_DIR}/${1}.conf"
else
  echo "Could not get a conf file."
  exit 1
fi


# < 오토 스케일링 설정 >

# autoscale_sample.sh를 참조해서 실제 환경 설정 값으로 대체하여, autoscale.sh 파일을 생성한다. 
sed -e "s@<MIN_CAPACITY>@$MIN_CAPACITY@g" autoscale_sample.sh > autoscale.sh
sed -i -e "s@<MAX_CAPACITY>@$MAX_CAPACITY@g" autoscale.sh
sed -i -e "s@<TARGET_VALUE>@$TARGET_VALUE@g" autoscale.sh

# 코드 빌드측에서 실행할 수 있도록 권한 부여 

echo "Grant execute permission to autoscale.sh"
chmod 700 ./autoscale.sh

# < aws 계정 id 및 ecr 리포지토리 정보 설정 > 

echo "Setting AWS AccountID..."
AWS_ACCOUNT_ID=`aws sts get-caller-identity --query 'Account' --output text`

# aws 어카운트 id가 12행 문자인지를 체크 

if [[ $AWS_ACCOUNT_ID =~ ^[0-9]{12}$ ]]; then
  echo "AWS AccountID is ${AWS_ACCOUNT_ID}"
else
  echo "Could not get AWS AccountID."
  exit 1
fi

# ecr 레포지토리 정보 설정 

# 클라우드 포메이션 스택을 조회하여 ecr 리포지토리 이름을 가져온다. 이 이름은 도커 이미지를 저장할 위치를 결정하는데 사용 
echo "Setting ECR Repo..."
IMAGE_REPO_NAME=`aws cloudformation describe-stacks --stack-name ${ENV}${PJ_PREFIX}-ECS --query "Stacks[*].Outputs[? contains(OutputKey, '${ENV}${PJ_PREFIX}${APP_NAME}${FRONT_OR_BACK}AppEcsResources${BG}Ecr')].OutputValue" --output text`

set 

if [[ -z $IMAGE_REPO_NAME ]]; then
    echo "Could not get ECR repo such as 'devblea-simplefrontstack-ecsapprepo1234'."
    exit 1
else
    echo "ECR Repo is ${IMAGE_REPO_NAME}"
fi

# 파이프라인 용 S3 버킷 정보를 취득 

echo "Setting Pipeline source S3 Bucket..."
S3_BUCKET=`aws cloudformation describe-stacks --stack-name ${ENV}${PJ_PREFIX}-ECS --query "Stacks[*].Outputs[? contains(OutputKey, '${ENV}${PJ_PREFIX}${APP_NAME}${FRONT_OR_BACK}App${BG}Pipeline')].OutputValue" --output text`
if [[ -z $S3_BUCKET ]]; then
    echo "Could not get S3 Bucket name."
    exit 1
else
    echo "S3 Bucket is ${S3_BUCKET}"
fi

# ECR 로그인 

echo "Logging in to Amazon ECR..."
aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com
if [ $? -ne 0 ]; then
    echo "Failed ECR login."
    exit 1
fi

# 컨테이너 폴더의 해쉬 값을 해시 태그에 설정 

# 현재 스크립트의 위치에서 상위 디렉토리로 이동한 후, 도커 파일을 사용하여 도커 이미지를 빌드 
IMAGE_TAG=`tar cf - $SCRIPT_DIR/../* > /dev/null 2>&1 | md5sum | cut -c 1-8`
echo "echo Building the Docker image..."
cd $SCRIPT_DIR/../../app # app 안의 도커 파일을 이미지로 빌드 해야 하므로. 
# 도커 이미지 빌드 
docker build -t $IMAGE_REPO_NAME:$IMAGE_TAG .  
if [ $? -ne 0 ]; then
    echo "Failed Docker build."
    exit 1
fi

# 빌드된 이미지에는 아래 형태의 태그가 지정된다. 
docker tag $IMAGE_REPO_NAME:$IMAGE_TAG $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com/$IMAGE_REPO_NAME:$IMAGE_TAG

# 만들어진 도커 이미지 ECR에 푸쉬 

echo Pushing the Docker image...
docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com/$IMAGE_REPO_NAME:$IMAGE_TAG
if [ $? -ne 0 ]; then
    echo "Failed Docker push."
    exit 1
fi

# 파이프라인용 S3 버킷에 소스파일 업로드 

echo Deploying to S3 BUCKET...

cd $SCRIPT_DIR

# ECR에 푸시된 도커 이미지의 정보를 포함하는 imagedefinitions.json 파일을 생성 
printf '[{\"name\":\"EcsApp\",\"imageUri\":\"%s\"}]' $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com/$IMAGE_REPO_NAME:$IMAGE_TAG > imagedefinitions.json
zip image.zip ecs-service-def.json ecs-task-def.json ecspresso.yml imagedefinitions.json autoscale.sh # 해당 파일들을 image.zip로 압축 
aws s3 cp image.zip s3://$S3_BUCKET # 생성된 image.zip 파일을 aws s3 버킷에 업로드 한다. 이 파일은 ecs 서비스의 업데이트나 새로운 배포를 위해 사용될 수 있다. 
if [ $? -ne 0 ]; then
    echo "Failed to upload files to S3."
    exit 1
fi