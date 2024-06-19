import requests

def lambda_handler(event, context):
    # ECS 클러스터의 서비스 URL
    ecs_service_url = 'http://backend.hinagiku-dev'

    # API 호출을 위한 데이터
    payload = {'key1': 'value1', 'key2': 'value2'}

    # Lambda 함수에서 ECS 클러스터로 API 호출
    response = requests.post(ecs_service_url, data=payload)

    # 응답 반환
    return {
        'statusCode': 200,
        'body': response.text
    }
