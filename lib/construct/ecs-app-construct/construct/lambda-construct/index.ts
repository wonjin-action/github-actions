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
import { CloudMap } from '../cloudmap';
import { PipelineLambdaConstruct } from './construct/lambda-pipline';
import { EcsCommonConstruct } from '../ecs-common-construct';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';

interface LambdaConstructProps extends cdk.StackProps {
  prefix: string;
  vpc: ec2.Vpc;
  alarmTopic: sns.Topic;
  cloudmap: CloudMap;
}

export class LambdaFrontConstruct extends Construct {
  // Iam Role for Lambda
  public readonly lambdaSecurityGroup: ec2.SecurityGroup;
  constructor(scope: Construct, id: string, props: LambdaConstructProps) {
    super(scope, id);

    // API Gateway
    const api = new apigatewayv2.HttpApi(this, 'MyApi', {
      apiName: 'MyServiceHttpApi',
    });

    // API ID
    new cdk.CfnOutput(this, 'ApiId', {
      value: api.apiId,
      exportName: 'Hinagiku-Api-ID',
    });

    new ssm.StringParameter(this, 'ApiIdParameter', {
      parameterName: '/Hinagiku/ApiGateway/api-id',
      stringValue: api.apiId,
    });

    // IAM Policy

    const FrontendLambdaPolicy = new iam.ManagedPolicy(this, 'LambdaPolicy', {
      managedPolicyName: 'Lambda_basic_policy',
      description: 'IAM policy for Lambda',
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'logs:*',
            'ecr:*',
            'apigateway:*',
            'logs:CreateLogGroup',
            'logs:CreateLogStream',
            'logs:PutLogEvents',
            'ec2:CreateNetworkInterface',
            'ec2:DescribeNetworkInterfaces',
            'ec2:DescribeSubnets',
            'ec2:DeleteNetworkInterface',
            'ec2:AssignPrivateIpAddresses',
            'ec2:UnassignPrivateIpAddresses',
            'servicediscovery:DiscoverInstances',
          ],
          resources: ['*'],
        }),
      ],
    });

    const lambdaSecurityGroup = new ec2.SecurityGroup(this, 'LambdaSecurityGroup', {
      vpc: props.vpc,
      description: 'Allow ',
      allowAllOutbound: true,
    });
    this.lambdaSecurityGroup = lambdaSecurityGroup;

    const lambdaRole = new iam.Role(this, `Frontend-LambdaRole-${props.prefix}`, {
      roleName: 'Lambda-Role', // Output Name
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });
    lambdaRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'));
    lambdaRole.addManagedPolicy(FrontendLambdaPolicy);

    new PipelineLambdaConstruct(this, `${props.prefix}-FrontApp-Pipeline`, {
      prefix: props.prefix,
      cloudmapService: props.cloudmap.frontendService,
      securityGroup: lambdaSecurityGroup,
      vpc: props.vpc,
      executionRole: lambdaRole,
    });
  }
}
