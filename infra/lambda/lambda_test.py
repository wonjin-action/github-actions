import requests
import logging

# 로깅 설정
logger = logging.getLogger()
logger.setLevel(logging.INFO)

def lambda_handler(event, context):
    # ECS 클러스터의 서비스 URL
    ecs_service_url = 'http://Hinagiku-Dev-EcsBackend-Service.Hinagiku-Dev'

    # 도메인 = 서비스이름.네임스페이스

    # API 호출을 위한 데이터
    payload = {'key1': 'value1', 'key2': 'value2'}

    try:
        # Lambda 함수에서 ECS 클러스터로 API 호출
        logger.info('Sending request to ECS service...')
        response = requests.post(ecs_service_url, data=payload)
        logger.info('Received response: %s', response.text)

        # 응답 반환
        return {
            'statusCode': 200,
            'body': response.text
        }
    except requests.exceptions.RequestException as e:
        # 오류 발생 시 로그 남기기
        logger.error('Request failed: %s', e)
        return {
            'statusCode': 500,
            'body': 'Internal Server Error'
        }
