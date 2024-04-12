"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Frontend = void 0;
const cdk = require("aws-cdk-lib");
const aws_cdk_lib_1 = require("aws-cdk-lib");
const aws_apigatewayv2_integrations_alpha_1 = require("@aws-cdk/aws-apigatewayv2-integrations-alpha");
const aws_lambda_1 = require("aws-cdk-lib/aws-lambda");
const aws_apigatewayv2_alpha_1 = require("@aws-cdk/aws-apigatewayv2-alpha");
const ecr = require("aws-cdk-lib/aws-ecr");
class Frontend extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        // const SERVICE_NAME = "fsde-back"; // 벡엔드 ecs를 구분하기위해 
        // const NAMESPACE = "local";
        //< vpc 정의 >  
        // let vpc : ec2.Vpc;
        // vpc는 ec2의 구성요소 때문에, ec2.vpc로 정의한다. 
        // vpc = new ec2.Vpc(this, 'vpc',{
        //   cidr : "10.0.0.0/16",
        //   vpcName : 'hinagiku-vpc',
        //   enableDnsHostnames : true,
        //   enableDnsSupport : true,
        //   subnetConfiguration : [
        //     {
        //       // 현재 퍼블릭 서브넷과 프라이빗 서브넷의 cidr 마스크를 24로 설정 
        //       // 퍼블릭과 프라이빗 서브넷의 주소가 따로 설정되어 있지 않으므로, 자동할당된다. 
        //       // 예를 들어, 퍼블릭 서브넷 10.0.1.0/24 , 프라이빗 서브넷 10.0.2.0/24 
        //       cidrMask : 24,
        //       name : "Publicsubnet",
        //       subnetType : ec2.SubnetType.PUBLIC,
        //     },
        //     {
        //       cidrMask : 24,
        //       name : "PrivateSubnet",
        //       subnetType : ec2.SubnetType.PRIVATE_ISOLATED,
        //     }
        //     ],
        //     maxAzs : 2,
        // })
        // < 클라우드 맵 정의 > 
        // 클라우드 맵의 서비스 디스커버리 기능을 사용하여 프라이빗 dns 네임 스페이스를 생성 
        // 클라우드 맵을 통해 애플리케이션의 서비스 인스턴스를 등록하고, 이를 이름으로 쉽게 검색 
        //  const dnsNamespace = new servicediscovery.PrivateDnsNamespace(
        // this,
        // 위의 구문을 통해, 클라우드 맵 내에서 프라이빗 dns 네임 스페이스를 생성 
        // 노션에 제대로 정리한다. 
        // PrivateDnsNamespace는 vpc 내에서만 접근 가능한 도메인 이름을 제공 
        //   "ServiceDiscovery",
        //   {
        //     name: NAMESPACE,
        //     vpc,
        //   }
        // );
        // < 프론트엔드와 백엔엔드 서비스에 대해서 보안 그룹 생성 > 
        // const frontSG = new SecurityGroup(this, "FrontSecurityGroup", {
        //   vpc,
        // });
        // const backSG = new SecurityGroup(this, "BackSecurityGroup", {
        //   vpc,
        // });
        // < 프론트로부터 오는 트래픽을 허용하는 인바운드 규칙을 백엔드 서비스에 설정 >
        // backSG.addIngressRule(frontSG, Port.tcp(1235));
        // 벡엔드 보안 그룹 ( backSG )에 addaddIngressRule함수로, 인바운드 규칙 추가 
        // 포트 번호 1235는 임의 설정 
        // 이미 널리 사용되고 있는 포트 ( 80, 443, 22 )등과의 충돌을 피하기 위해 import * as ecr from 'aws-cdk-lib/aws-ecr';
        ///// 프론트 엔드 /////
        // < Refer to ECR > 
        const repository = ecr.Repository.fromRepositoryName(this, 'Repository', 'my-app-dev');
        // < Lambda 정의 > 
        const handler = new aws_lambda_1.DockerImageFunction(this, 'Handler', {
            code: aws_lambda_1.DockerImageCode.fromEcr(repository, {
                // 람다 함수가 호출할 도커이미지 파일의 경로 
                tag: 'latest'
            }),
            memorySize: 256,
            timeout: aws_cdk_lib_1.Duration.seconds(30),
            // vpc : vpc , // 람다를 vpc 안에 넣음 -ha
        });
        // < API Gateway 정의 > 
        new aws_apigatewayv2_alpha_1.HttpApi(this, 'Api', {
            apiName: 'Frontend',
            defaultIntegration: new aws_apigatewayv2_integrations_alpha_1.HttpLambdaIntegration('Integration', handler),
        });
        ///// 백엔드 /////
        // 벡엔드 태스크 정의 // 
        // 태스크는 컨테이너의 실행 환경을 정의 // 
        // const backendTask = new ecs.FargateTaskDefinition(this,"BackendTask",{
        //   runtimePlatform : {
        //     cpuArchitecture: ecs.CpuArchitecture.ARM64,
        //   },
        //   memoryLimitMiB : 512,
        //   cpu : 256, // fargate vCPU의 할당 단위를 의미한다. 
        // });
        // 백엔드 컨테이너를 정의 //
        // 백엔드 컨테이너 -> 태스크 ( ecs에서 움직이고 있는 컨테이너 )
        // 컨테이너는 애플리케이션 자체의 세부 사항 설정 // 
        // const backendContainer = backendTask.addContainer("BackendContainer", {
        //   image: ecs.ContainerImage.fromEcrRepository(repository, "latest"),
        //   // 이미지는 컨테이너가 사용할 이미지를 지정한다. 
        //   // 즉, 위의 경로에 도커 파일 또는 다른 필요한 파일들이 포함되어 있어야 한다. 
        //   // 이 파일들을 사용하여, 도커 이미지가 생성된다. 
        //   // 컨테이너의 로그를 관리하는 방법을 결정 
        //   logging: ecs.LogDriver.awsLogs({
        //     streamPrefix: "ecs-fsde-back",
        //     // 스트림 접두어-> 클라우드 워치 로그에 생성될 로그 스트림의 이름에 추가될 접두어 
        //     // 이를 통해 로그를 쉽게 식별하고 검색할 수 있다. 
        //     logRetention: log.RetentionDays.ONE_MONTH,
        //     // 로그 보존 기간 -> ( ONE_MONTH ) 한달로 설정 
        //   }),
        //   healthCheck: {
        //     command: ["CMD-SHELL", "curl -f http://localhost:1235 || exit 1"],
        //     // 컨테이너의 건강 상태를 검사하는 명령어 
        //     // 여기서 curl 명령어를 사용하여 컨테이너 내부의 1235포트에 http 요청을 보내고, 
        //     // 이 요청이 실패하면, exit 1을 출력한다. 
        //     retries: 2, // 명령이 실패할 경우, 재시도 횟수 
        //     interval: Duration.seconds(30), // 각 시도의 사이 간격 
        //     timeout: Duration.seconds(15), // 각 시도의 타임 아웃 
        //     startPeriod: Duration.seconds(5), // 컨테이너가 시작된 후, 헬스 체크가 시작되기까지의 시간 
        //   },
        // });
        // 포트 추가 // 
        // 참고로, 내부 백엔드 서비스가 1235 포트를 사용하고 있으므로, 
        // 프론트엔드는 백엔드와 통신을 하기 위해, 1235 포트에 트래픽을 전송해야 한다. 
        // backendContainer.addPortMappings({
        //   containerPort: 1235,
        //   hostPort: 1235,
        // });
        // 12월 26일 여기까지 정리 밑에 부터 다시 정리 -> 클러스터 
        // 백엔드 클러스터 정의 // 
        // 클러스터 내에서 여러 태스크와 서비스가 실행되며, 클러스터는 이들의 네트워크 구성과 
        // 할당을 관리한다. 
        // 클러스터는 특정 vpc에 할당된다. 이를 통해 클러스터 내의 모든 태스크는 해당 vpc의 
        // 네트ㅋ워크 설정 ( 서브넷, 라우팅, 보안 그룹 )을 사용한다. 
        // 즉, 프론트 엔드, 백엔드 , 데이터 베이스 등 )가 각각의 태스크로 클러스터 내에서 실행 
        /////////////////////////////////////////////////////////////////////
        // 1월 9일부터 여기서 다시 시작 /// 
        //   const backCluster = new ecs.Cluster(this, "BackCluster", {
        //     vpc,
        //   });
        //   new ecs.FargateService(this, "BackendService", {
        //     cluster: backCluster,
        //     taskDefinition: backendTask,
        //     desiredCount: 4,
        //     assignPublicIp: true,
        //     enableExecuteCommand: true,
        //     cloudMapOptions: {
        //       name: SERVICE_NAME,
        //       cloudMapNamespace: dnsNamespace,
        //       dnsRecordType: servicediscovery.DnsRecordType.A,
        //       dnsTtl: Duration.seconds(30),
        //     },
        //     securityGroups: [backSG], // 백엔드용 보안 그룹을 사용한다. 
        //   });
    }
}
exports.Frontend = Frontend;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibXktY2RrLXByb2plY3Qtc3RhY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJteS1jZGstcHJvamVjdC1zdGFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSxtQ0FBbUM7QUFFbkMsNkNBQXVDO0FBQ3ZDLHNHQUFxRjtBQUNyRix1REFBOEU7QUFDOUUsNEVBQTBEO0FBTzFELDJDQUEyQztBQWlCM0MsTUFBYSxRQUFTLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFHckMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUFzQjtRQUM5RCxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4Qix3REFBd0Q7UUFFeEQsNkJBQTZCO1FBQzdCLGNBQWM7UUFNZCxxQkFBcUI7UUFFckIsc0NBQXNDO1FBQ3RDLGtDQUFrQztRQUVsQywwQkFBMEI7UUFDMUIsOEJBQThCO1FBQzlCLCtCQUErQjtRQUMvQiw2QkFBNkI7UUFDN0IsNEJBQTRCO1FBQzVCLFFBQVE7UUFDUixtREFBbUQ7UUFFbkQsd0RBQXdEO1FBQ3hELDhEQUE4RDtRQUU5RCx1QkFBdUI7UUFDdkIsK0JBQStCO1FBQy9CLDRDQUE0QztRQUU1QyxTQUFTO1FBQ1QsUUFBUTtRQUNSLHVCQUF1QjtRQUN2QixnQ0FBZ0M7UUFDaEMsc0RBQXNEO1FBRXRELFFBQVE7UUFFUixTQUFTO1FBQ1Qsa0JBQWtCO1FBQ2xCLEtBQUs7UUFFTCxpQkFBaUI7UUFFZCxtREFBbUQ7UUFFcEQsb0RBQW9EO1FBRXBELGtFQUFrRTtRQUNsRSxRQUFRO1FBQ1IsOENBQThDO1FBRTlDLGlCQUFpQjtRQUVqQixtREFBbUQ7UUFFckQsd0JBQXdCO1FBQ3hCLE1BQU07UUFDTix1QkFBdUI7UUFDdkIsV0FBVztRQUNYLE1BQU07UUFDTixLQUFLO1FBRUwscUNBQXFDO1FBRXJDLGtFQUFrRTtRQUNsRSxTQUFTO1FBQ1QsTUFBTTtRQUVOLGdFQUFnRTtRQUNoRSxTQUFTO1FBQ1QsTUFBTTtRQUVOLCtDQUErQztRQUcvQyxrREFBa0Q7UUFDOUMsMERBQTBEO1FBQzFELHFCQUFxQjtRQUNyQiw2RkFBNkY7UUFFakcsa0JBQWtCO1FBR2xCLG9CQUFvQjtRQUNwQixNQUFNLFVBQVUsR0FBRyxHQUFHLENBQUMsVUFBVSxDQUFDLGtCQUFrQixDQUFDLElBQUksRUFBRSxZQUFZLEVBQUUsWUFBWSxDQUFDLENBQUM7UUFDdkYsaUJBQWlCO1FBQ2pCLE1BQU0sT0FBTyxHQUFHLElBQUksZ0NBQW1CLENBQUMsSUFBSSxFQUFFLFNBQVMsRUFBRTtZQUN2RCxJQUFJLEVBQUUsNEJBQWUsQ0FBQyxPQUFPLENBQUMsVUFBVSxFQUFFO2dCQUN4QywyQkFBMkI7Z0JBQzNCLEdBQUcsRUFBRyxRQUFRO2FBQ2YsQ0FBQztZQUNGLFVBQVUsRUFBRSxHQUFHO1lBQ2YsT0FBTyxFQUFFLHNCQUFRLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztZQUM3QixtQ0FBbUM7U0FDcEMsQ0FBQyxDQUFDO1FBRUgsc0JBQXNCO1FBQ3RCLElBQUksZ0NBQU8sQ0FBQyxJQUFJLEVBQUUsS0FBSyxFQUFFO1lBQ3ZCLE9BQU8sRUFBRSxVQUFVO1lBQ25CLGtCQUFrQixFQUFFLElBQUksMkRBQXFCLENBQUMsYUFBYSxFQUFFLE9BQU8sQ0FBQztTQUN0RSxDQUFDLENBQUM7UUFFSCxlQUFlO1FBRWYsaUJBQWlCO1FBQ2pCLDJCQUEyQjtRQUczQix5RUFBeUU7UUFFekUsd0JBQXdCO1FBQ3hCLGtEQUFrRDtRQUVsRCxPQUFPO1FBRVAsMEJBQTBCO1FBQzFCLDhDQUE4QztRQUM5QyxNQUFNO1FBSU4sa0JBQWtCO1FBRWxCLHlDQUF5QztRQUV6QyxnQ0FBZ0M7UUFFaEMsMEVBQTBFO1FBQzFFLHVFQUF1RTtRQUN2RSxrQ0FBa0M7UUFDbEMsb0RBQW9EO1FBQ3BELG1DQUFtQztRQUVuQyw4QkFBOEI7UUFDOUIscUNBQXFDO1FBQ3JDLHFDQUFxQztRQUNyQyx3REFBd0Q7UUFDeEQsc0NBQXNDO1FBQ3RDLGlEQUFpRDtRQUNqRCwyQ0FBMkM7UUFDM0MsUUFBUTtRQUNSLG1CQUFtQjtRQUNuQix5RUFBeUU7UUFDekUsZ0NBQWdDO1FBQ2hDLDREQUE0RDtRQUM1RCxvQ0FBb0M7UUFDcEMseUNBQXlDO1FBQ3pDLHNEQUFzRDtRQUN0RCxxREFBcUQ7UUFDckQsMkVBQTJFO1FBRzNFLE9BQU87UUFDUCxNQUFNO1FBRU4sWUFBWTtRQUVaLHdDQUF3QztRQUN4QyxpREFBaUQ7UUFHakQscUNBQXFDO1FBQ3JDLHlCQUF5QjtRQUN6QixvQkFBb0I7UUFDcEIsTUFBTTtRQUVOLHVDQUF1QztRQUV2QyxrQkFBa0I7UUFFbEIsa0RBQWtEO1FBRWxELGFBQWE7UUFFYixxREFBcUQ7UUFDckQsdUNBQXVDO1FBQ3ZDLHNEQUFzRDtRQUV0RCxxRUFBcUU7UUFFckUseUJBQXlCO1FBRzNCLCtEQUErRDtRQUMvRCxXQUFXO1FBQ1gsUUFBUTtRQUVSLHFEQUFxRDtRQUNyRCw0QkFBNEI7UUFDNUIsbUNBQW1DO1FBQ25DLHVCQUF1QjtRQUN2Qiw0QkFBNEI7UUFDNUIsa0NBQWtDO1FBQ2xDLHlCQUF5QjtRQUN6Qiw0QkFBNEI7UUFDNUIseUNBQXlDO1FBQ3pDLHlEQUF5RDtRQUN6RCxzQ0FBc0M7UUFDdEMsU0FBUztRQUNULHNEQUFzRDtRQUN0RCxRQUFRO0lBR1IsQ0FBQztDQVFGO0FBek5ELDRCQXlOQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcbmltcG9ydCB7IER1cmF0aW9uIH0gZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0IHsgSHR0cExhbWJkYUludGVncmF0aW9uIH0gZnJvbSAnQGF3cy1jZGsvYXdzLWFwaWdhdGV3YXl2Mi1pbnRlZ3JhdGlvbnMtYWxwaGEnO1xuaW1wb3J0IHsgRG9ja2VySW1hZ2VDb2RlLCBEb2NrZXJJbWFnZUZ1bmN0aW9uIH0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWxhbWJkYSc7XG5pbXBvcnQgeyBIdHRwQXBpIH0gZnJvbSAnQGF3cy1jZGsvYXdzLWFwaWdhdGV3YXl2Mi1hbHBoYSc7XG5pbXBvcnQgeyBQbGF0Zm9ybSB9IGZyb20gJ2F3cy1jZGstbGliL2F3cy1lY3ItYXNzZXRzJztcbmltcG9ydCAqIGFzIGVjMiBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZWMyJztcbmltcG9ydCAqIGFzIHNlcnZpY2VkaXNjb3ZlcnkgZnJvbSBcImF3cy1jZGstbGliL2F3cy1zZXJ2aWNlZGlzY292ZXJ5XCI7XG5pbXBvcnQgKiBhcyBlY3MgZnJvbSBcImF3cy1jZGstbGliL2F3cy1lY3NcIjtcbmltcG9ydCAqIGFzIGxvZyBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWxvZ3NcIjtcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7IFxuaW1wb3J0ICogYXMgZWNyIGZyb20gJ2F3cy1jZGstbGliL2F3cy1lY3InO1xuaW1wb3J0IHtcbiAgQXBwbGljYXRpb25Mb2FkQmFsYW5jZXIsXG4gIEFwcGxpY2F0aW9uUHJvdG9jb2wsXG4gIEFwcGxpY2F0aW9uVGFyZ2V0R3JvdXAsXG4gIFRhcmdldFR5cGUsXG59IGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtZWxhc3RpY2xvYWRiYWxhbmNpbmd2MlwiO1xuXG5pbXBvcnQge1xuICBCYXN0aW9uSG9zdExpbnV4LFxuICBQZWVyLFxuICBQb3J0LFxuICBTZWN1cml0eUdyb3VwLFxuICBTdWJuZXRUeXBlLFxuICBWcGMsXG59IGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtZWMyXCI7XG5cbmV4cG9ydCBjbGFzcyBGcm9udGVuZCBleHRlbmRzIGNkay5TdGFjayB7XG4gIHJlYWRvbmx5IGVuZHBvaW50OiBzdHJpbmc7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM/OiBjZGsuU3RhY2tQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xuICAgIFxuICAgIC8vIGNvbnN0IFNFUlZJQ0VfTkFNRSA9IFwiZnNkZS1iYWNrXCI7IC8vIOuyoeyXlOuTnCBlY3Prpbwg6rWs67aE7ZWY6riw7JyE7ZW0IFxuICAgIFxuICAgIC8vIGNvbnN0IE5BTUVTUEFDRSA9IFwibG9jYWxcIjtcbiAgICAvLzwgdnBjIOygleydmCA+ICBcbiAgICBcbiAgICBcbiAgICBcbiAgICBcbiAgICBcbiAgICAvLyBsZXQgdnBjIDogZWMyLlZwYztcbiAgICBcbiAgICAvLyB2cGPripQgZWMy7J2YIOq1rOyEseyalOyGjCDrlYzrrLjsl5AsIGVjMi52cGProZwg7KCV7J2Y7ZWc64ukLiBcbiAgICAvLyB2cGMgPSBuZXcgZWMyLlZwYyh0aGlzLCAndnBjJyx7XG4gICAgICBcbiAgICAvLyAgIGNpZHIgOiBcIjEwLjAuMC4wLzE2XCIsXG4gICAgLy8gICB2cGNOYW1lIDogJ2hpbmFnaWt1LXZwYycsXG4gICAgLy8gICBlbmFibGVEbnNIb3N0bmFtZXMgOiB0cnVlLFxuICAgIC8vICAgZW5hYmxlRG5zU3VwcG9ydCA6IHRydWUsXG4gICAgLy8gICBzdWJuZXRDb25maWd1cmF0aW9uIDogW1xuICAgIC8vICAgICB7XG4gICAgLy8gICAgICAgLy8g7ZiE7J6sIO2NvOu4lOumrSDshJzruIzrhLfqs7wg7ZSE65287J2067mXIOyEnOu4jOuEt+ydmCBjaWRyIOuniOyKpO2BrOulvCAyNOuhnCDshKTsoJUgXG4gICAgICAgICAgXG4gICAgLy8gICAgICAgLy8g7Y2867iU66at6rO8IO2UhOudvOydtOu5lyDshJzruIzrhLfsnZgg7KO87IaM6rCAIOuUsOuhnCDshKTsoJXrkJjslrQg7J6I7KeAIOyViuycvOuvgOuhnCwg7J6Q64+Z7ZWg64u565Cc64ukLiBcbiAgICAvLyAgICAgICAvLyDsmIjrpbwg65Ok7Ja0LCDtjbzruJTrpq0g7ISc67iM64S3IDEwLjAuMS4wLzI0ICwg7ZSE65287J2067mXIOyEnOu4jOuEtyAxMC4wLjIuMC8yNCBcbiAgICAgICAgICBcbiAgICAvLyAgICAgICBjaWRyTWFzayA6IDI0LFxuICAgIC8vICAgICAgIG5hbWUgOiBcIlB1YmxpY3N1Ym5ldFwiLFxuICAgIC8vICAgICAgIHN1Ym5ldFR5cGUgOiBlYzIuU3VibmV0VHlwZS5QVUJMSUMsXG4gICAgICAgIFxuICAgIC8vICAgICB9LFxuICAgIC8vICAgICB7XG4gICAgLy8gICAgICAgY2lkck1hc2sgOiAyNCxcbiAgICAvLyAgICAgICBuYW1lIDogXCJQcml2YXRlU3VibmV0XCIsXG4gICAgLy8gICAgICAgc3VibmV0VHlwZSA6IGVjMi5TdWJuZXRUeXBlLlBSSVZBVEVfSVNPTEFURUQsXG4gICAgICAgICAgXG4gICAgLy8gICAgIH1cbiAgICAgICAgXG4gICAgLy8gICAgIF0sXG4gICAgLy8gICAgIG1heEF6cyA6IDIsXG4gICAgLy8gfSlcbiAgICBcbiAgICAvLyA8IO2BtOudvOyasOuTnCDrp7Ug7KCV7J2YID4gXG4gICAgXG4gICAgICAgLy8g7YG065287Jqw65OcIOunteydmCDshJzruYTsiqQg65SU7Iqk7Luk67KE66asIOq4sOuKpeydhCDsgqzsmqntlZjsl6wg7ZSE65287J2067mXIGRucyDrhKTsnoQg7Iqk7Y6Y7J207Iqk66W8IOyDneyEsSBcbiAgICAgIFxuICAgICAgLy8g7YG065287Jqw65OcIOunteydhCDthrXtlbQg7JWg7ZSM66as7LyA7J207IWY7J2YIOyEnOu5hOyKpCDsnbjsiqTthLTsiqTrpbwg65Ox66Gd7ZWY6rOgLCDsnbTrpbwg7J2066aE7Jy866GcIOyJveqyjCDqsoDsg4kgXG4gICAgICBcbiAgICAgIC8vICBjb25zdCBkbnNOYW1lc3BhY2UgPSBuZXcgc2VydmljZWRpc2NvdmVyeS5Qcml2YXRlRG5zTmFtZXNwYWNlKFxuICAgICAgLy8gdGhpcyxcbiAgICAgIC8vIOychOydmCDqtazrrLjsnYQg7Ya17ZW0LCDtgbTrnbzsmrDrk5wg66e1IOuCtOyXkOyEnCDtlITrnbzsnbTruZcgZG5zIOuEpOyehCDsiqTtjpjsnbTsiqTrpbwg7IOd7ISxIFxuICAgICAgXG4gICAgICAvLyDrhbjshZjsl5Ag7KCc64yA66GcIOygleumrO2VnOuLpC4gXG4gICAgICBcbiAgICAgIC8vIFByaXZhdGVEbnNOYW1lc3BhY2XripQgdnBjIOuCtOyXkOyEnOunjCDsoJHqt7wg6rCA64ql7ZWcIOuPhOuplOyduCDsnbTrpoTsnYQg7KCc6rO1IFxuICAgICAgXG4gICAgLy8gICBcIlNlcnZpY2VEaXNjb3ZlcnlcIixcbiAgICAvLyAgIHtcbiAgICAvLyAgICAgbmFtZTogTkFNRVNQQUNFLFxuICAgIC8vICAgICB2cGMsXG4gICAgLy8gICB9XG4gICAgLy8gKTtcbiAgICBcbiAgICAvLyA8IO2UhOuhoO2KuOyXlOuTnOyZgCDrsLHsl5Tsl5Trk5wg7ISc67mE7Iqk7JeQIOuMgO2VtOyEnCDrs7TslYgg6re466O5IOyDneyEsSA+IFxuICAgIFxuICAgIC8vIGNvbnN0IGZyb250U0cgPSBuZXcgU2VjdXJpdHlHcm91cCh0aGlzLCBcIkZyb250U2VjdXJpdHlHcm91cFwiLCB7XG4gICAgLy8gICB2cGMsXG4gICAgLy8gfSk7XG5cbiAgICAvLyBjb25zdCBiYWNrU0cgPSBuZXcgU2VjdXJpdHlHcm91cCh0aGlzLCBcIkJhY2tTZWN1cml0eUdyb3VwXCIsIHtcbiAgICAvLyAgIHZwYyxcbiAgICAvLyB9KTtcbiAgICBcbiAgICAvLyA8IO2UhOuhoO2KuOuhnOu2gO2EsCDsmKTripQg7Yq4656Y7ZS97J2EIO2XiOyaqe2VmOuKlCDsnbjrsJTsmrTrk5wg6rec7LmZ7J2EIOuwseyXlOuTnCDshJzruYTsiqTsl5Ag7ISk7KCVID5cbiAgICBcbiAgICBcbiAgICAvLyBiYWNrU0cuYWRkSW5ncmVzc1J1bGUoZnJvbnRTRywgUG9ydC50Y3AoMTIzNSkpO1xuICAgICAgICAvLyDrsqHsl5Trk5wg67O07JWIIOq3uOujuSAoIGJhY2tTRyAp7JeQIGFkZGFkZEluZ3Jlc3NSdWxl7ZWo7IiY66GcLCDsnbjrsJTsmrTrk5wg6rec7LmZIOy2lOqwgCBcbiAgICAgICAgLy8g7Y+s7Yq4IOuyiO2YuCAxMjM164qUIOyehOydmCDshKTsoJUgXG4gICAgICAgIC8vIOydtOuvuCDrhJDrpqwg7IKs7Jqp65CY6rOgIOyeiOuKlCDtj6ztirggKCA4MCwgNDQzLCAyMiAp65Ox6rO87J2YIOy2qeuPjOydhCDtlLztlZjquLAg7JyE7ZW0IGltcG9ydCAqIGFzIGVjciBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZWNyJztcbiAgICAgICAgXG4gICAgLy8vLy8g7ZSE66Gg7Yq4IOyXlOuTnCAvLy8vL1xuICAgIFxuXG4gICAgLy8gPCBSZWZlciB0byBFQ1IgPiBcbiAgICBjb25zdCByZXBvc2l0b3J5ID0gZWNyLlJlcG9zaXRvcnkuZnJvbVJlcG9zaXRvcnlOYW1lKHRoaXMsICdSZXBvc2l0b3J5JywgJ215LWFwcC1kZXYnKTtcbiAgICAvLyA8IExhbWJkYSDsoJXsnZggPiBcbiAgICBjb25zdCBoYW5kbGVyID0gbmV3IERvY2tlckltYWdlRnVuY3Rpb24odGhpcywgJ0hhbmRsZXInLCB7XG4gICAgICBjb2RlOiBEb2NrZXJJbWFnZUNvZGUuZnJvbUVjcihyZXBvc2l0b3J5LCB7XG4gICAgICAgIC8vIOuejOuLpCDtlajsiJjqsIAg7Zi47Lac7ZWgIOuPhOy7pOydtOuvuOyngCDtjIzsnbzsnZgg6rK966GcIFxuICAgICAgICB0YWcgOiAnbGF0ZXN0J1xuICAgICAgfSksXG4gICAgICBtZW1vcnlTaXplOiAyNTYsXG4gICAgICB0aW1lb3V0OiBEdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgIC8vIHZwYyA6IHZwYyAsIC8vIOuejOuLpOulvCB2cGMg7JWI7JeQIOuEo+ydjCAtaGFcbiAgICB9KTtcblxuICAgIC8vIDwgQVBJIEdhdGV3YXkg7KCV7J2YID4gXG4gICAgbmV3IEh0dHBBcGkodGhpcywgJ0FwaScsIHtcbiAgICAgIGFwaU5hbWU6ICdGcm9udGVuZCcsXG4gICAgICBkZWZhdWx0SW50ZWdyYXRpb246IG5ldyBIdHRwTGFtYmRhSW50ZWdyYXRpb24oJ0ludGVncmF0aW9uJywgaGFuZGxlciksXG4gICAgfSk7XG4gICAgXG4gICAgLy8vLy8g67Cx7JeU65OcIC8vLy8vXG4gICAgXG4gICAgLy8g67Kh7JeU65OcIO2DnOyKpO2BrCDsoJXsnZggLy8gXG4gICAgLy8g7YOc7Iqk7YGs64qUIOy7qO2FjOydtOuEiOydmCDsi6Ttlokg7ZmY6rK97J2EIOygleydmCAvLyBcbiAgICBcbiAgICBcbiAgICAvLyBjb25zdCBiYWNrZW5kVGFzayA9IG5ldyBlY3MuRmFyZ2F0ZVRhc2tEZWZpbml0aW9uKHRoaXMsXCJCYWNrZW5kVGFza1wiLHtcbiAgICAgIFxuICAgIC8vICAgcnVudGltZVBsYXRmb3JtIDoge1xuICAgIC8vICAgICBjcHVBcmNoaXRlY3R1cmU6IGVjcy5DcHVBcmNoaXRlY3R1cmUuQVJNNjQsXG4gICAgICAgIFxuICAgIC8vICAgfSxcbiAgICAgIFxuICAgIC8vICAgbWVtb3J5TGltaXRNaUIgOiA1MTIsXG4gICAgLy8gICBjcHUgOiAyNTYsIC8vIGZhcmdhdGUgdkNQVeydmCDtlaDri7kg64uo7JyE66W8IOydmOuvuO2VnOuLpC4gXG4gICAgLy8gfSk7XG4gICAgXG4gICAgXG4gICAgXG4gICAgLy8g67Cx7JeU65OcIOy7qO2FjOydtOuEiOulvCDsoJXsnZggLy9cbiAgICBcbiAgICAvLyDrsLHsl5Trk5wg7Luo7YWM7J2064SIIC0+IO2DnOyKpO2BrCAoIGVjc+yXkOyEnCDsm4Dsp4HsnbTqs6Ag7J6I64qUIOy7qO2FjOydtOuEiCApXG4gICAgXG4gICAgLy8g7Luo7YWM7J2064SI64qUIOyVoO2UjOumrOy8gOydtOyFmCDsnpDssrTsnZgg7IS467aAIOyCrO2VrSDshKTsoJUgLy8gXG4gICAgXG4gICAgLy8gY29uc3QgYmFja2VuZENvbnRhaW5lciA9IGJhY2tlbmRUYXNrLmFkZENvbnRhaW5lcihcIkJhY2tlbmRDb250YWluZXJcIiwge1xuICAgIC8vICAgaW1hZ2U6IGVjcy5Db250YWluZXJJbWFnZS5mcm9tRWNyUmVwb3NpdG9yeShyZXBvc2l0b3J5LCBcImxhdGVzdFwiKSxcbiAgICAvLyAgIC8vIOydtOuvuOyngOuKlCDsu6jthYzsnbTrhIjqsIAg7IKs7Jqp7ZWgIOydtOuvuOyngOulvCDsp4DsoJXtlZzri6QuIFxuICAgIC8vICAgLy8g7KaJLCDsnITsnZgg6rK966Gc7JeQIOuPhOy7pCDtjIzsnbwg65iQ64qUIOuLpOuluCDtlYTsmpTtlZwg7YyM7J2865Ok7J20IO2PrO2VqOuQmOyWtCDsnojslrTslbwg7ZWc64ukLiBcbiAgICAvLyAgIC8vIOydtCDtjIzsnbzrk6TsnYQg7IKs7Jqp7ZWY7JesLCDrj4Tsu6Qg7J2066+47KeA6rCAIOyDneyEseuQnOuLpC4gXG4gICAgICBcbiAgICAvLyAgIC8vIOy7qO2FjOydtOuEiOydmCDroZzqt7jrpbwg6rSA66as7ZWY64qUIOuwqeuyleydhCDqsrDsoJUgXG4gICAgLy8gICBsb2dnaW5nOiBlY3MuTG9nRHJpdmVyLmF3c0xvZ3Moe1xuICAgIC8vICAgICBzdHJlYW1QcmVmaXg6IFwiZWNzLWZzZGUtYmFja1wiLFxuICAgIC8vICAgICAvLyDsiqTtirjrprwg7KCR65GQ7Ja0LT4g7YG065287Jqw65OcIOybjOy5mCDroZzqt7jsl5Ag7IOd7ISx65CgIOuhnOq3uCDsiqTtirjrprzsnZgg7J2066aE7JeQIOy2lOqwgOuQoCDsoJHrkZDslrQgXG4gICAgLy8gICAgIC8vIOydtOulvCDthrXtlbQg66Gc6re466W8IOyJveqyjCDsi53rs4TtlZjqs6Ag6rKA7IOJ7ZWgIOyImCDsnojri6QuIFxuICAgIC8vICAgICBsb2dSZXRlbnRpb246IGxvZy5SZXRlbnRpb25EYXlzLk9ORV9NT05USCxcbiAgICAvLyAgICAgLy8g66Gc6re4IOuztOyhtCDquLDqsIQgLT4gKCBPTkVfTU9OVEggKSDtlZzri6zroZwg7ISk7KCVIFxuICAgIC8vICAgfSksXG4gICAgLy8gICBoZWFsdGhDaGVjazoge1xuICAgIC8vICAgICBjb21tYW5kOiBbXCJDTUQtU0hFTExcIiwgXCJjdXJsIC1mIGh0dHA6Ly9sb2NhbGhvc3Q6MTIzNSB8fCBleGl0IDFcIl0sXG4gICAgLy8gICAgIC8vIOy7qO2FjOydtOuEiOydmCDqsbTqsJUg7IOB7YOc66W8IOqygOyCrO2VmOuKlCDrqoXroLnslrQgXG4gICAgLy8gICAgIC8vIOyXrOq4sOyEnCBjdXJsIOuqheugueyWtOulvCDsgqzsmqntlZjsl6wg7Luo7YWM7J2064SIIOuCtOu2gOydmCAxMjM17Y+s7Yq47JeQIGh0dHAg7JqU7LKt7J2EIOuztOuCtOqzoCwgXG4gICAgLy8gICAgIC8vIOydtCDsmpTssq3snbQg7Iuk7Yyo7ZWY66m0LCBleGl0IDHsnYQg7Lac66Cl7ZWc64ukLiBcbiAgICAvLyAgICAgcmV0cmllczogMiwgLy8g66qF66C57J20IOyLpO2MqO2VoCDqsr3smrAsIOyerOyLnOuPhCDtmp/siJggXG4gICAgLy8gICAgIGludGVydmFsOiBEdXJhdGlvbi5zZWNvbmRzKDMwKSwgLy8g6rCBIOyLnOuPhOydmCDsgqzsnbQg6rCE6rKpIFxuICAgIC8vICAgICB0aW1lb3V0OiBEdXJhdGlvbi5zZWNvbmRzKDE1KSwgLy8g6rCBIOyLnOuPhOydmCDtg4DsnoQg7JWE7JuDIFxuICAgIC8vICAgICBzdGFydFBlcmlvZDogRHVyYXRpb24uc2Vjb25kcyg1KSwgLy8g7Luo7YWM7J2064SI6rCAIOyLnOyekeuQnCDtm4QsIO2XrOyKpCDssrTtgazqsIAg7Iuc7J6R65CY6riw6rmM7KeA7J2YIOyLnOqwhCBcbiAgICAgICAgXG4gICAgICAgIFxuICAgIC8vICAgfSxcbiAgICAvLyB9KTtcbiAgICBcbiAgICAvLyDtj6ztirgg7LaU6rCAIC8vIFxuICAgIFxuICAgIC8vIOywuOqzoOuhnCwg64K067aAIOuwseyXlOuTnCDshJzruYTsiqTqsIAgMTIzNSDtj6ztirjrpbwg7IKs7Jqp7ZWY6rOgIOyeiOycvOuvgOuhnCwgXG4gICAgLy8g7ZSE66Gg7Yq47JeU65Oc64qUIOuwseyXlOuTnOyZgCDthrXsi6DsnYQg7ZWY6riwIOychO2VtCwgMTIzNSDtj6ztirjsl5Ag7Yq4656Y7ZS97J2EIOyghOyGoe2VtOyVvCDtlZzri6QuIFxuICAgIFxuICAgIFxuICAgIC8vIGJhY2tlbmRDb250YWluZXIuYWRkUG9ydE1hcHBpbmdzKHtcbiAgICAvLyAgIGNvbnRhaW5lclBvcnQ6IDEyMzUsXG4gICAgLy8gICBob3N0UG9ydDogMTIzNSxcbiAgICAvLyB9KTtcbiAgICBcbiAgICAvLyAxMuyblCAyNuydvCDsl6zquLDquYzsp4Ag7KCV66asIOuwkeyXkCDrtoDthLAg64uk7IucIOygleumrCAtPiDtgbTrn6zsiqTthLAgXG4gICAgXG4gICAgLy8g67Cx7JeU65OcIO2BtOufrOyKpO2EsCDsoJXsnZggLy8gXG4gICAgXG4gICAgLy8g7YG065+s7Iqk7YSwIOuCtOyXkOyEnCDsl6zrn6wg7YOc7Iqk7YGs7JmAIOyEnOu5hOyKpOqwgCDsi6TtlonrkJjrqbAsIO2BtOufrOyKpO2EsOuKlCDsnbTrk6TsnZgg64Sk7Yq47JuM7YGsIOq1rOyEseqzvCBcbiAgICBcbiAgICAvLyDtlaDri7nsnYQg6rSA66as7ZWc64ukLiBcbiAgICBcbiAgICAvLyDtgbTrn6zsiqTthLDripQg7Yq57KCVIHZwY+yXkCDtlaDri7nrkJzri6QuIOydtOulvCDthrXtlbQg7YG065+s7Iqk7YSwIOuCtOydmCDrqqjrk6Ag7YOc7Iqk7YGs64qUIO2VtOuLuSB2cGPsnZggXG4gICAgLy8g64Sk7Yq444WL7JuM7YGsIOyEpOyglSAoIOyEnOu4jOuEtywg65287Jqw7YyFLCDrs7TslYgg6re466O5ICnsnYQg7IKs7Jqp7ZWc64ukLiBcbiAgICAvLyDspoksIO2UhOuhoO2KuCDsl5Trk5wsIOuwseyXlOuTnCAsIOuNsOydtO2EsCDrsqDsnbTsiqQg65OxICnqsIAg6rCB6rCB7J2YIO2DnOyKpO2BrOuhnCDtgbTrn6zsiqTthLAg64K07JeQ7IScIOyLpO2WiSBcbiAgICBcbiAgICAvLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cbiAgICBcbiAgICAvLyAx7JuUIDnsnbzrtoDthLAg7Jes6riw7IScIOuLpOyLnCDsi5zsnpEgLy8vIFxuICAgIFxuICAgIFxuICAvLyAgIGNvbnN0IGJhY2tDbHVzdGVyID0gbmV3IGVjcy5DbHVzdGVyKHRoaXMsIFwiQmFja0NsdXN0ZXJcIiwge1xuICAvLyAgICAgdnBjLFxuICAvLyAgIH0pO1xuXG4gIC8vICAgbmV3IGVjcy5GYXJnYXRlU2VydmljZSh0aGlzLCBcIkJhY2tlbmRTZXJ2aWNlXCIsIHtcbiAgLy8gICAgIGNsdXN0ZXI6IGJhY2tDbHVzdGVyLFxuICAvLyAgICAgdGFza0RlZmluaXRpb246IGJhY2tlbmRUYXNrLFxuICAvLyAgICAgZGVzaXJlZENvdW50OiA0LFxuICAvLyAgICAgYXNzaWduUHVibGljSXA6IHRydWUsXG4gIC8vICAgICBlbmFibGVFeGVjdXRlQ29tbWFuZDogdHJ1ZSxcbiAgLy8gICAgIGNsb3VkTWFwT3B0aW9uczoge1xuICAvLyAgICAgICBuYW1lOiBTRVJWSUNFX05BTUUsXG4gIC8vICAgICAgIGNsb3VkTWFwTmFtZXNwYWNlOiBkbnNOYW1lc3BhY2UsXG4gIC8vICAgICAgIGRuc1JlY29yZFR5cGU6IHNlcnZpY2VkaXNjb3ZlcnkuRG5zUmVjb3JkVHlwZS5BLFxuICAvLyAgICAgICBkbnNUdGw6IER1cmF0aW9uLnNlY29uZHMoMzApLFxuICAvLyAgICAgfSxcbiAgLy8gICAgIHNlY3VyaXR5R3JvdXBzOiBbYmFja1NHXSwgLy8g67Cx7JeU65Oc7JqpIOuztOyViCDqt7jro7nsnYQg7IKs7Jqp7ZWc64ukLiBcbiAgLy8gICB9KTtcbiAgICBcbiAgICBcbiAgfVxuICBcbiAgXG4gIFxuXG5cbiAgXG4gIFxufVxuIl19