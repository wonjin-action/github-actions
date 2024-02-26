// 코드 파이프 라인과 코드 빌드 프로젝트를 설정한다.
// 이것은 소스에서 부터 빌드, 배포 단계까지의 파이프 라인을 구성한다.

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

export interface PipelineEcspressoConstructProps extends cdk.StackProps {
  prefix: string;
  appName: string;
  ecsCluster: ecs.Cluster;
  ecsServiceName: string;
  targetGroup?: elbv2.ApplicationTargetGroup;
  securityGroup: ec2.SecurityGroup;
  vpc: ec2.Vpc;
  logGroup: cwl.LogGroup;
  port: number;
  logGroupForServiceConnect?: cwl.LogGroup;
  ecsNameSpace?: sd.INamespace;
  executionRole: iam.Role;
  taskRole?: iam.Role;
}

export class PipelineEcspressoConstruct extends Construct {
  constructor(scope: Construct, id: string, props: PipelineEcspressoConstructProps) {
    super(scope, id);

    //タスクロール,TargetGroupが指定されていない場合は、空文字をCodeBuildの環境変数として設定
    const taskRoleArn = props.taskRole?.roleArn || props.executionRole.roleArn;
    const targetGroupArn = props.targetGroup?.targetGroupArn || '';
    const nameSpaceArn = props.ecsNameSpace?.namespaceArn || '';
    const logGroupForServiceConnect = props.logGroupForServiceConnect?.logGroupName || '';

    const sourceBucket = new s3.Bucket(this, `PipelineSourceBucket`, {
      versioned: true,
      eventBridgeEnabled: true, // 이벤트 브릿지가 이벤트를 발생시킬 수 있도록 한다.
    });
    sourceBucket.grantRead(props.executionRole, '.env');

    //  aws 코드 빌드 프로젝트가 생성되며, 이는 도커 이미지를 사용하여 ,ecs 서비스를 배포하는 빌드 작업을 정의한다.
    const deployProject = new codebuild.PipelineProject(this, 'DeployProject', {
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
      },
      environmentVariables: {
        ECS_CLUSTER: {
          value: props.ecsCluster.clusterName,
        },
        ECS_SERVICE: {
          value: props.ecsServiceName,
        },
        TARGET_GROUP_ARN: {
          value: targetGroupArn,
        },
        SECURITY_GROUP: {
          value: props.securityGroup.securityGroupId,
        },
        // Subnet数が3の前提
        SUBNET_1: {
          value: props.vpc.selectSubnets({
            subnetGroupName: 'Private',
          }).subnetIds[0],
        },
        SUBNET_2: {
          value: props.vpc.selectSubnets({
            subnetGroupName: 'Private',
          }).subnetIds[1],
        },
        SUBNET_3: {
          value: props.vpc.selectSubnets({
            subnetGroupName: 'Private',
          }).subnetIds[2],
        },
        LOG_GROUP: {
          value: props.logGroup.logGroupName,
        },
        LOG_GROUP_SERVICE_CONNECT: {
          value: logGroupForServiceConnect,
        },
        EXECUTION_ROLE_ARN: {
          value: props.executionRole.roleArn,
        },
        TASK_ROLE: {
          value: taskRoleArn,
        },
        FAMILY: {
          value: `${props.prefix}-${props.appName}-Taskdef`,
        },
        NAMESPACE: {
          value: nameSpaceArn,
        },
        ENVFILE_BUCKET_ARN: {
          value: sourceBucket.arnForObjects('.env'),
        },
        APP_PORT: {
          value: props.port,
        },
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          pre_build: {
            commands: [
              // 最新バージョンは表示しつつ、installは固定バージョンを使用
              'echo "The latest version of ecspresso is (It only shows up the log) :"',
              'curl -s https://api.github.com/repos/kayac/ecspresso/releases/latest | jq .tag_name',
              'curl -sL -o ecspresso-v2.0.3-linux-amd64.tar.gz https://github.com/kayac/ecspresso/releases/download/v2.0.3/ecspresso_2.0.3_linux_amd64.tar.gz',
              'tar -zxf ecspresso-v2.0.3-linux-amd64.tar.gz',
              'sudo install ecspresso /usr/local/bin/ecspresso',
              'ecspresso version',
            ],
          },
          build: {
            //빌드 단계
            commands: [
              //https://github.com/kayac/ecspresso
              'export IMAGE_NAME=`cat imagedefinitions.json | jq -r .[0].imageUri`', // imagedefinitions.json에서 도커 이미지 url를 읽어 환경 변수 IMAGE_NAME에 할당한다.
              'ls -lR', // 현재 작업 디렉터리와  그 하위의 모든 파일 및 디렉토리 목록을 출력한다.
              'ecspresso deploy --config ecspresso.yml', // ecspresso.yml 설정 파일에 따라 ecs 서비스를 배포한다. ecspresso.yml은 ecs 서비스의 구성을 정의하는 파일이다.
              './autoscale.sh', // ecs 서비스의 오토스케일링 설정을 조정한다. 이 스크립트는 aws 어플리케이션 오토 스케일링 설정을 구성하여, 트래픽이나 사용량에 따라 서비스의 인스턴스 수를 자동으로 조절한다.
            ],
          },
        },
      }),
    });

    deployProject.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'ecs:RegisterTaskDefinition',
          'ecs:ListTaskDefinitions',
          'ecs:DescribeTaskDefinition',
          'ecs:CreateService',
          'ecs:UpdateService',
          'ecs:DescribeServices',
          'application-autoscaling:DescribeScalableTargets',
          'application-autoscaling:RegisterScalableTarget',
          'application-autoscaling:DeregisterScalableTarget',
          'application-autoscaling:PutScalingPolicy',
          'application-autoscaling:DeleteScalingPolicy',
          'servicediscovery:GetNamespace',
          'iam:CreateServiceLinkedRole',
          'sts:AssumeRole',
        ],
        resources: ['*'],
      }),
    );

    if (props.taskRole) {
      deployProject.addToRolePolicy(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['iam:PassRole'],
          resources: [props.executionRole.roleArn, props.taskRole.roleArn],
        }),
      );
    } else {
      deployProject.addToRolePolicy(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['iam:PassRole'],
          resources: [props.executionRole.roleArn],
        }),
      );
    }

    const sourceOutput = new codepipeline.Artifact();

    // 코드 파이프 라인 설정
    const sourceAction = new actions.S3SourceAction({
      actionName: 'SourceBucket', // 파이프 라인 내에서 이 액션을 식별하는데 사용
      bucket: sourceBucket, // 소스 파일을 포함하고 있는 s3 버킷의 참조
      bucketKey: 'image.zip',
      output: sourceOutput,
      trigger: actions.S3Trigger.NONE,
    });

    const deployAction = new actions.CodeBuildAction({
      actionName: 'DeployProject',
      input: sourceOutput,
      project: deployProject,
    });

    const pipeline = new codepipeline.Pipeline(this, 'Pipeline', {});

    pipeline.addStage({
      stageName: 'Source',
      actions: [sourceAction],
    });

    pipeline.addStage({
      stageName: 'Deploy',
      actions: [deployAction],
    });

    // 이벤트 브릿지를 통해서 코드 파이프 라인 트리거 설정
    // s3 버킷에 새로운 객체가 생성될 때 이벤트를 발생시킨다.
    // 즉, image.zip 파일이 업로드 될 때 마다 파이프 라인이 실행된다.
    new events.Rule(this, 'PipelineTriggerEventRule', {
      eventPattern: {
        account: [cdk.Stack.of(this).account],
        source: ['aws.s3'],
        detailType: ['Object Created'],
        detail: {
          bucket: {
            name: [sourceBucket.bucketName],
          },
          object: {
            key: ['image.zip'],
          },
        },
      },
      targets: [new targets.CodePipeline(pipeline)],
    });

    cdk.Stack.of(this).exportValue(sourceBucket.bucketName, {
      // 밑에 이름은 클라우드 포메이션 출력에서 이 값을 찾기 위해 사용하는 이름이다.
      // 이 이름을 통해 해당 값을 aws 콘솔에서 확인하거나, 다른 리소스에서 참조할 수 있다.
      // 밑에처럼 동적으로 설정하지 않으면, cdk.Stack.of(this).exportValue(sourceBucket.bucketName 메소드를 사용하여,
      // ('sourceBucket')으로 여러 번의 Export를 시도하기 때문
      name: `${props.prefix}-${props.appName}-SourceBucketName`,
    });
  }
}
