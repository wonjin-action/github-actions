import boto3
import requests
import logging

# 로깅 설정
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# AWS 자격 증명 설정 (AWS CLI로 설정된 자격 증명 사용)
cloudmap_client = boto3.client('servicediscovery')

def discover_service():
    try:
        response = cloudmap_client.discover_instances(
            NamespaceName='Hinagiku-Dev',
            ServiceName='backend'
        )
        instances = response['Instances']
        if not instances:
            logger.error('No instances found for the service.')
            return None
        instance = instances[0]
        # Cloud Map에서 반환된 Attributes 키 이름 확인
        service_url = f"http://{instance['Attributes']['AWS_INSTANCE_IPV4']}:{instance['Attributes']['AWS_INSTANCE_PORT']}"
        return service_url
    except Exception as e:
        logger.error('Error discovering service: %s', e)
        return None

def call_service():
    service_url = discover_service()
    if not service_url:
        logger.error('Service discovery failed.')
        return

    payload = {'key1': 'value1', 'key2': 'value2'}

    try:
        logger.info('Sending request to ECS service at %s...', service_url)
        response = requests.post(service_url, data=payload)
        logger.info('Received response: %s', response.text)
    except requests.exceptions.RequestException as e:
        logger.error('Request failed: %s', e)

if __name__ == '__main__':
    call_service()





# import requests
# import logging

# # 로깅 설정
# logger = logging.getLogger()
# logger.setLevel(logging.INFO)

# def lambda_handler(event, context):
#     # ECS 클러스터의 서비스 URL
#     ecs_service_url = 'http://backend.Hinagiku-Dev'

#     # 도메인 = 서비스이름.네임스페이스

#     # API 호출을 위한 데이터
#     payload = {'key1': 'value1', 'key2': 'value2'}

#     try:
#         # Lambda 함수에서 ECS 클러스터로 API 호출
#         logger.info('Sending request to ECS service...')
#         response = requests.post(ecs_service_url, data=payload)
#         logger.info('Received response: %s', response.text)

#         # 응답 반환
#         return {
#             'statusCode': 200,
#             'body': response.text
#         }
#     except requests.exceptions.RequestException as e:
#         # 오류 발생 시 로그 남기기
#         logger.error('Request failed: %s', e)
#         return {
#             'statusCode': 500,
#             'body': 'Internal Server Error'
#         }
