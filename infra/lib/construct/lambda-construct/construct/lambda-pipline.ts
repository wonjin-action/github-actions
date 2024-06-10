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
import { EcsCommonConstruct } from '../../ecs-app-construct/construct/ecs-common-construct';
import * as sns from 'aws-cdk-lib/aws-sns';
import { LambdaFrontConstruct } from '../index-lamba';
import { PipelineEcspressoConstruct } from '../../ecs-app-construct/construct/pipeline-ecspresso-construct';

export interface PipelineEcspressoConstructProps extends cdk.StackProps {
  prefix: string;
  // appName: string;
  // ecsCluster: ecs.Cluster;
  // ecsServiceName: string;
  // targetGroup?: elbv2.ApplicationTargetGroup;
  securityGroup: ec2.SecurityGroup;
  vpc: ec2.Vpc;
  logGroup?: cwl.LogGroup;
  // port: number;
  logGroupForServiceConnect?: cwl.LogGroup;
  cloudmapService: sd.IService;

  // taskRole?: iam.Role;
  executionRole: iam.Role;
}

export class Pipeline_lambdaConstruct extends Construct {
  public readonly LambdaCommon: EcsCommonConstruct;
  constructor(scope: Construct, id: string, props: PipelineEcspressoConstructProps) {
    super(scope, id);

    //タスクロール,TargetGroupが指定されていない場合は、空文字をCodeBuildの環境変数として設定
    // const taskRoleArn = props.taskRole?.roleArn || props.executionRole.roleArn;
    // const targetGroupArn = props.targetGroup?.targetGroupArn || '';
    // const logGroupForServiceConnect = props.logGroupForServiceConnect?.logGroupName || '';

    // Create CodePipeLine Role

    const codePipelineRole = new iam.Role(this, 'CodePipelineRole', {
      assumedBy: new iam.ServicePrincipal('codepipeline.amazonaws.com'),
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess')],
    });

    // Create CodeBuildRole

    const codeBuildRole = new iam.Role(this, 'CodeBuildRole', {
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess')],
    });

    const sourceBucket_name = cdk.Fn.importValue('bucketName'); // ecs 코드파이프라인에서 생성된 버킷 참조하기
    const sourceBucket = s3.Bucket.fromBucketArn(this, 'SourceBucket', sourceBucket_name);

    sourceBucket.grantRead(props.executionRole, '.env'); // ecs 클러스터가 s3에 대해서 읽을 수 있도록 권한을 부여한다.
    // sourceBucket.grantRead -> To allow access Permisson for s3 bucket
    const deployProject = new codebuild.PipelineProject(this, 'DeployProject', {
      role: codeBuildRole,
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
      },
      environmentVariables: {
        // ECS_CLUSTER: {
        //   value: props.ecsCluster.clusterName,
        // },
        // ECS_SERVICE: {
        //   value: props.ecsServiceName,
        // },
        // TARGET_GROUP_ARN: {
        //   value: targetGroupArn,
        // },
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
        // LOG_GROUP: {
        //   value: props.logGroup.logGroupName,
        // },
        // LOG_GROUP_SERVICE_CONNECT: {
        //   value: logGroupForServiceConnect,
        // },
        // EXECUTION_ROLE_ARN: {
        //   value: props.executionRole.roleArn,
        // },
        // TASK_ROLE: {
        //   value: taskRoleArn,
        // },
        // FAMILY: {
        //   value: `${props.prefix}-${props.appName}-Taskdef`,
        // },
        REGISTRY_ARN: {
          value: props.cloudmapService.serviceArn,
        },
        ENVFILE_BUCKET_ARN: {
          value: sourceBucket.arnForObjects('.env'),
        },
        // APP_PORT: {
        //   value: props.port,
        // },
        SourceBucket: {
          value: sourceBucket.bucketName,
        },
        Role: {
          value: [],
        },
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          pre_build: {
            commands: [
              // 最新バージョンは表示しつつ、installは固定バージョンを使用
              'pwd',

              'aws s3 cp s3://${SourceBucket}/image.zip image.zip',

              'mkdir -p ./unzip_folder',

              'ls -l',

              'unzip -o -j image.zip -d ./unzip_folder', // 기존 파일이 존재할 경우, 덮어씌우도록 만든다. -> 자동으로 설정

              'ls -l ./unzip_folder',
            ],
          },
          build: {
            commands: [
              'pwd',
              'echo "Create to Lambda  is Running"',
              'bash ./unzip_folder/lambda.sh',
              'echo "Lambda has been created"',
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
          'application-autoscaling:DescribeScalingPolicies',
          'servicediscovery:GetNamespace',
          'iam:CreateServiceLinkedRole',
          'sts:AssumeRole',
          'lambda:*', // 나중에 수정 필요 ,
          's3:GetObject',
          'ssm:GetParameter',
          'cloudformation:DescribeStacks',
          'apigateway:GET',
          'iam:AttachRolePolicy',
          'apigateway:POST',
          'iam:PassRole',
          'iam:CreateRole',
        ],
        resources: ['*'],
      }),
    );
    // // 여기를 어떻게 해결해야하는지 알아볼 것
    // if (props.taskRole) {
    //   deployProject.addToRolePolicy(
    //     new iam.PolicyStatement({
    //       effect: iam.Effect.ALLOW,
    //       actions: [
    //       'iam:PassRole',
    //       'iam:PassRole',
    //       'iam:CreateRole',
    //       'iam:AttachRolePolicy',],
    //       resources: [props.executionRole.roleArn, props.taskRole.roleArn],
    //     }),
    //   );
    // } else {
    //   deployProject.addToRolePolicy(
    //     new iam.PolicyStatement({
    //       effect: iam.Effect.ALLOW,
    //       actions: ['iam:PassRole'],
    //       resources: [props.executionRole.roleArn],
    //     }),
    //   );
    // }

    const sourceOutput = new codepipeline.Artifact();

    // Code Pipeline Settings
    const sourceAction = new actions.S3SourceAction({
      actionName: 'SourceBucket',
      bucket: sourceBucket,
      bucketKey: 'image.zip',
      output: sourceOutput,
      trigger: actions.S3Trigger.NONE,
    });

    const deployAction = new actions.CodeBuildAction({
      actionName: 'DeployProject',
      input: sourceOutput,
      project: deployProject,
    });

    const pipeline = new codepipeline.Pipeline(this, 'Pipeline', {
      crossAccountKeys: false,
      role: codePipelineRole,
    });

    pipeline.addStage({
      stageName: 'Source',
      actions: [sourceAction],
    });

    pipeline.addStage({
      stageName: 'Deploy',
      actions: [deployAction],
    });

    // Set code pipeline trigger via event bridge
    // When a new object is created in the s3 bucket, it generates an event.
    // That is, whenever the image.zip file is uploaded, the pipeline is executed.
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

    // cdk.Stack.of(this).exportValue(sourceBucket.bucketName, {
    //   // Dynamically set the name for verification in cloud formation
    //   name: `sourceBucket-${props.appName}`,
    // });

    // codeBuildRole.addToPolicy(new iam.PolicyStatement({
    //   actions: [
    //     'ecs:RegisterTaskDefinition',
    //     'ecs:ListTaskDefinitions',
    //     'ecs:DescribeTaskDefinition',
    //     'ecs:CreateService',
    //     'ecs:UpdateService',
    //     'ecs:DescribeServices',
    //     'iam:PassRole',
    //     "iam:CreateRole",
    //     "iam:DeleteRole",
    //     "iam:AttachRolePolicy",
    //     "iam:DetachRolePolicy",
    //     "iam:PutRolePolicy",
    //     "iam:DeleteRolePolicy",
    //     "iam:PassRole",
    //     "iam:GetRole",
    //     "iam:ListRolePolicies",
    //     "iam:ListAttachedRolePolicies",
    //     "iam:UpdateAssumeRolePolicy"

    //   ],
    //   resources: ['*'], // 필요한 리소스를 구체적으로 지정
    // }));

    const securityGroupParam = new ssm.StringParameter(this, 'Lambda/Lambda-SecurityGroup', {
      parameterName: '/Lambda/Lambda-SecurityGroup',
      stringValue: props.securityGroup.securityGroupId,
    });

    const roleParam = new ssm.StringParameter(this, 'Lambda-Role', {
      parameterName: '/Lambda/Lambda-Role',
      stringValue: props.executionRole.roleArn,
    });

    console.log(`CodeBuild project role ARN: ${deployProject.role?.roleArn}`);
  }
}
