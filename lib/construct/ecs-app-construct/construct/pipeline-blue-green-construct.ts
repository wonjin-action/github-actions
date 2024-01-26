import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as actions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as codedeploy from 'aws-cdk-lib/aws-codedeploy';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import { aws_elasticloadbalancingv2 as elbv2 } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { aws_logs as cwl } from 'aws-cdk-lib';

export interface PipelineBgConstructProps extends cdk.StackProps {
  prefix: string;
  appName: string;
  ecsService: ecs.FargateService;
  blueTargetGroup: elbv2.ApplicationTargetGroup;
  greenTargetGroup: elbv2.ApplicationTargetGroup;
  listener: elbv2.ApplicationListener;
  testListener: elbv2.ApplicationListener;
  securityGroup: ec2.SecurityGroup;
  vpc: ec2.Vpc;
  logGroup: cwl.LogGroup;
  executionRole: iam.Role;
  taskRole?: iam.Role;
}

export class PipelineBgConstruct extends Construct {
  constructor(scope: Construct, id: string, props: PipelineBgConstructProps) {
    super(scope, id);

    const sourceBucket = new s3.Bucket(this, 'PipelineSourceBucket', {
      versioned: true,
    });

    const ecsDeployApplication = new codedeploy.EcsApplication(this, 'EcsDeployApplication', {});

    const ecsDeployGroup = new codedeploy.EcsDeploymentGroup(this, 'BlueGreenDeploy', {
      service: props.ecsService,
      blueGreenDeploymentConfig: {
        blueTargetGroup: props.blueTargetGroup,
        greenTargetGroup: props.greenTargetGroup,
        listener: props.listener,
        testListener: props.testListener,
        deploymentApprovalWaitTime: cdk.Duration.hours(1),
        terminationWaitTime: cdk.Duration.hours(1),
      },
      deploymentConfig: codedeploy.EcsDeploymentConfig.ALL_AT_ONCE,
      application: ecsDeployApplication,
      autoRollback: {
        failedDeployment: true,
      },
    });

    const sourceOutput = new codepipeline.Artifact();

    const sourceAction = new actions.S3SourceAction({
      actionName: 'SourceBucket',
      bucket: sourceBucket,
      bucketKey: 'image.zip',
      output: sourceOutput,
    });

    const deployAction = new actions.CodeDeployEcsDeployAction({
      actionName: 'ECSBlueGreenDeploy',
      deploymentGroup: ecsDeployGroup,
      taskDefinitionTemplateInput: sourceOutput,
      appSpecTemplateInput: sourceOutput,
      containerImageInputs: [
        {
          input: sourceOutput,
          taskDefinitionPlaceholder: 'IMAGE1_NAME',
        },
      ],
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

    new cdk.CfnOutput(this, `${props.appName}SourceBucketName`, { value: sourceBucket.bucketName });
  }
}
