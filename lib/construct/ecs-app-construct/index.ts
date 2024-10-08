import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as sns from 'aws-cdk-lib/aws-sns';
import { EcsappConstruct } from './construct/ecs-app-construct';
import { EcsCommonConstruct } from './construct/ecs-common-construct';
import { PipelineEcspressoConstruct } from './construct/pipeline-ecspresso-construct';
import { IEcsAlbParam, IEcsParam } from '../../../params/interface';
import { BastionECSAppConstruct } from './construct/bastion-ecs-construct';
import * as iam from 'aws-cdk-lib/aws-iam';
import { CloudMap } from './construct/cloudmap';
import * as cdk from 'aws-cdk-lib';
import { LambdaFrontConstruct } from './construct/lambda-construct';
interface EcsAppConstructProps {
  vpc: ec2.Vpc;
  appKey: kms.IKey;
  alarmTopic: sns.Topic;
  prefix: string;
  ecsFrontTasks?: IEcsAlbParam;
  ecsBackTasks?: IEcsParam[];
  ecsBastionTasks: boolean;
  ecsAuthTasks?: IEcsParam[];
}

export class EcsAppConstruct extends Construct {
  public readonly frontLambdaApp: LambdaFrontConstruct;
  public readonly backEcsApps: EcsappConstruct[];
  public readonly ecsCommon: EcsCommonConstruct;
  public readonly bastionApp: BastionECSAppConstruct;
  public readonly authEcsApps: EcsappConstruct[];
  public readonly cloudmap: CloudMap;

  constructor(scope: Construct, id: string, props: EcsAppConstructProps) {
    super(scope, id);

    //ECS Common
    const ecsCommon = new EcsCommonConstruct(this, `${props.prefix}-EcsCommon`, {
      vpc: props.vpc,
      alarmTopic: props.alarmTopic,
      prefix: props.prefix,
    });
    this.ecsCommon = ecsCommon;

    const cloudmap = new CloudMap(this, 'CloudMap', {
      namespaceName: props.prefix,
      vpc: props.vpc,
    });
    this.cloudmap = cloudmap;

    const lambdaApp = new LambdaFrontConstruct(this, `${props.prefix}-LambdaApp`, {
      vpc: props.vpc,
      prefix: props.prefix,
      alarmTopic: props.alarmTopic,
      cloudmap: cloudmap,
    });
    this.frontLambdaApp = lambdaApp;

    if (props.ecsBackTasks) {
      const backEcsApps = props.ecsBackTasks.map((ecsApp) => {
        return new EcsappConstruct(this, `${props.prefix}-${ecsApp.appName}-BackApp-Ecs-Resources`, {
          vpc: props.vpc,
          ecsCluster: ecsCommon.ecsCluster,
          appName: ecsApp.appName,
          prefix: props.prefix,
          appKey: props.appKey,
          alarmTopic: props.alarmTopic,
          allowFromSg: [lambdaApp.lambdaSecurityGroup],
          portNumber: ecsApp.portNumber,
        });
      });
      this.backEcsApps = backEcsApps;

      //Pipeline for Backend Rolling
      backEcsApps.forEach((ecsApp) => {
        new PipelineEcspressoConstruct(this, `${props.prefix}-${ecsApp.appName}-BackApp-Pipeline`, {
          prefix: props.prefix,
          appName: ecsApp.appName,
          ecsCluster: ecsCommon.ecsCluster,
          ecsServiceName: ecsApp.ecsServiceName,
          securityGroup: ecsApp.securityGroupForFargate,
          vpc: props.vpc,
          logGroup: ecsApp.fargateLogGroup,
          logGroupForServiceConnect: ecsApp.serviceConnectLogGroup,
          cloudmapService: cloudmap.backendService,
          executionRole: ecsCommon.ecsTaskExecutionRole,
          port: ecsApp.portNumber,
          taskRole: new iam.Role(this, 'BackendTaskRole', {
            assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
            managedPolicies: [{ managedPolicyArn: 'arn:aws:iam::aws:policy/AdministratorAccess' }],
          }),
        });
      });
    }
    if (props.ecsAuthTasks != undefined) {
      const authEcsApps = props.ecsAuthTasks.map((ecsApp) => {
        return new EcsappConstruct(this, `${props.prefix}-${ecsApp.appName}-Auth-Ecs-Resources`, {
          vpc: props.vpc,
          ecsCluster: ecsCommon.ecsCluster,
          appName: ecsApp.appName,
          prefix: props.prefix,
          appKey: props.appKey,
          alarmTopic: props.alarmTopic,
          allowFromSg: this.backEcsApps.map((ecsAlbApp) => ecsAlbApp.securityGroupForFargate),
          portNumber: ecsApp.portNumber,
        });
      });
      this.authEcsApps = authEcsApps;

      //Pipeline for Backend Rolling
      authEcsApps.forEach((ecsApp) => {
        new PipelineEcspressoConstruct(this, `${props.prefix}-${ecsApp.appName}-AuthApp-Pipeline`, {
          prefix: props.prefix,
          appName: ecsApp.appName,
          ecsCluster: ecsCommon.ecsCluster,
          ecsServiceName: ecsApp.ecsServiceName,
          securityGroup: ecsApp.securityGroupForFargate,
          vpc: props.vpc,
          logGroup: ecsApp.fargateLogGroup,
          logGroupForServiceConnect: ecsApp.serviceConnectLogGroup,
          cloudmapService: cloudmap.authService,
          executionRole: ecsCommon.ecsTaskExecutionRole,
          port: ecsApp.portNumber,
          // TODO: must be reviewed permission of this role.
          taskRole: new iam.Role(this, 'AuthTaskRole', {
            assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
            managedPolicies: [{ managedPolicyArn: 'arn:aws:iam::aws:policy/AdministratorAccess' }],
          }),
        });
      });
    }

    //Bastion Container
    if (props.ecsBastionTasks) {
      const bastionApp = new BastionECSAppConstruct(this, `${props.prefix}-Bastion-ECSAPP`, {
        vpc: props.vpc,
        appKey: props.appKey,
        containerImageTag: 'bastionimage',
        containerConfig: {
          cpu: 256,
          memoryLimitMiB: 512,
        },
        repositoryName: 'bastionrepo',
        ecsTaskExecutionRole: ecsCommon.ecsTaskExecutionRole,
      });
      this.bastionApp = bastionApp;
    }
  }
}
