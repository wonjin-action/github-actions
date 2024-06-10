import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as actions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import { aws_elasticloadbalancingv2 as elbv2 } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { aws_logs as cwl } from 'aws-cdk-lib';
import { aws_servicediscovery as sd } from 'aws-cdk-lib';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { CloudMap } from '../../construct/ecs-app-construct/construct/cloudmap';
import { Pipeline_lambdaConstruct } from './construct/lambda-pipline';
import { EcsCommonConstruct } from '../../construct/ecs-app-construct/construct/ecs-common-construct';
import * as sns from 'aws-cdk-lib/aws-sns';

// codepipeline에 보안 그룹, iam 역할, vpc 등을 환경 변수로 전달하면,
// 별도의 연결 작업 없이 코드 빌드 환경 안에서 해당 환경 변수를 사용할 수 있다.

// 인터페이스는 LambdaFrontConstruct가 인스턴스로 생성될 때 인터페이스에 지정된 프로퍼티에 대한 값을 받는다.

///

// // LambdaFrontConstruct 클래스의 인스턴스를 생성할 때,
// LambdaConstructProps 인터페이스에서 지정한 값들을 전달해야 합니다.
// 그리고 그 값을 props를 통해 접근할 수 있습니다.
// props를 통해 전달된 값은 클래스 내부에서 props.프로퍼티명으로 참조할 수 있습니다.

// // 직접 정의한 값은 props를 통해 전달받는 것이 아니라
// 클래스 내부에서 직접 선언하고 사용할 수 있습니다.
// 예를 들어, logGroup은 props를 통해 전달받지 않고
// 클래스 내부에서 직접 생성하고 사용합니다.

// props를 통해 값을 전달받고, 다시 다른 클래스의 인스턴스를 생성할 때, props를 통해
// 동일한 값을 전달해줄 수 있다.

// 즉, bin디렉토리 ts에서 생성된 인스턴스에 resoure.vpc를 전달하고, 인스턴스를 생성하게 되면,
// resoure.vpc는 생성된 인스턴스에서 props.vpc로 값을 사용할 수 있고, 다시 생성된 인스턴스에서
// 새로운 인스턴스를 생성할 때 props.vpc를 하면 동일한 resource.vpc를 전달할 수 있다.

interface LambdaConstructProps extends cdk.StackProps {
  prefix: string;
  vpc: ec2.Vpc;
  alarmTopic: sns.Topic;
  securityGroup: ec2.SecurityGroup;
  cloudmap: CloudMap; // app 파일에서 상위스택과 하위 스택을 연결한다.
  // cloudmap 이 클래스로 되어 있기 때문에 클래스 타입인 CloudMap로 설정
}

export class LambdaFrontConstruct extends Construct {
  // Iam Role for Lambda

  constructor(scope: Construct, id: string, props: LambdaConstructProps) {
    super(scope, id);

    // 여기를 수정해야한다. -> 람다가 클러스터로 만들어졌다
    // const LambdaCommon = new EcsCommonConstruct(this, `${props.prefix}-LambdaCommon`, {
    //   vpc: props.vpc, // props -> shareResources.vpc
    //   alarmTopic: props.alarmTopic,
    //   prefix: props.prefix,
    // });
    // this.LambdaCommon = LambdaCommon;

    // IAM Policy

    const lambda_policy = new iam.ManagedPolicy(this, 'Lambda_policy', {
      managedPolicyName: 'Lambda_basic_policy',
      description: 'IAM policy for Lambda',
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['logs:*', 'ecr:*', 'apigateway:*'],
          resources: ['arn:aws:logs:*:*:*', 'arn:aws:ecr:ap-northeast-1:*:*', 'arn:aws:apigateway:ap-northeast-1:*:*'],
        }),
      ],
    });

    const lambda_role = new iam.Role(this, `Frontend-Role-${props.prefix}`, {
      roleName: 'Lambda-Role',
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });
    lambda_role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
    );
    lambda_role.addManagedPolicy(lambda_policy);
    // Lamda Layer
    // const nodeModulesLayer = new lambda.LayerVersion(this, 'NodeModulesLayer', {
    // code: lambda.AssetCode.fromAsset(path.join(__dirname, '../.build')),
    // // compatibleRuntimes: [lambda.Runtime.NODEJS_12_X],
    // });

    // create Log Group
    // const logGroup = new cwl.LogGroup(this, 'LogGroup-lambda', {
    //   logGroupName: `${props.prefix}-LogGroup-lambda`,
    //   });

    new Pipeline_lambdaConstruct(this, `${props.prefix}-FrontApp-Pipeline`, {
      prefix: props.prefix,
      cloudmapService: props.cloudmap.frontendService,
      securityGroup: props.securityGroup, // 람다 함수 보안그룹
      vpc: props.vpc,
      executionRole: lambda_role,
    });
  }
}
