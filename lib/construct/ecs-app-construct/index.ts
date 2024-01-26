import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as sns from 'aws-cdk-lib/aws-sns';
import { EcsappConstruct } from './construct/ecs-app-construct';
import { EcsCommonConstruct } from './construct/ecs-common-construct';
import { PipelineEcspressoConstruct } from './construct/pipeline-ecspresso-construct';
import { AlbConstruct } from './construct/alb-construct';
import { IEcsAlbParam, IEcsParam, ICertificateIdentifier } from '../../../params/interface';
import { BastionECSAppConstruct } from './construct/bastion-ecs-construct';

interface EcsAppConstructProps {
  vpc: ec2.Vpc;
  appKey: kms.IKey;
  alarmTopic: sns.Topic;
  prefix: string;
  AlbCertificateIdentifier: ICertificateIdentifier;
  ecsFrontTasks: IEcsAlbParam;
  ecsBackTasks: IEcsParam[];
  ecsBastionTasks: boolean;
}

export class EcsAppConstruct extends Construct {
  public readonly frontAlb: AlbConstruct;
  public readonly frontEcsApps: EcsappConstruct[];
  public readonly backEcsApps: EcsappConstruct[];
  public readonly ecsCommon: EcsCommonConstruct;
  public readonly bastionApp: BastionECSAppConstruct;

  constructor(scope: Construct, id: string, props: EcsAppConstructProps) {
    super(scope, id);

    //ECS Common
    const ecsCommon = new EcsCommonConstruct(this, `${props.prefix}-ECSCommon`, {
      vpc: props.vpc,
      alarmTopic: props.alarmTopic,
      prefix: props.prefix,

      // -- SAMPLE: Pass your own ECR repository and your own image
      //  repository: ecr.repository,
      //  imageTag: build_container.imageTag,
    });
    this.ecsCommon = ecsCommon;

    if (props.ecsFrontTasks) {
      //Create Origin Resources
      const frontAlb = new AlbConstruct(this, `${props.prefix}-FrontAlb`, {
        vpc: props.vpc,
        alarmTopic: props.alarmTopic,
        AlbCertificateIdentifier: props.AlbCertificateIdentifier,
        ecsApps: props.ecsFrontTasks,
      });
      this.frontAlb = frontAlb;

      const frontEcsApps = props.ecsFrontTasks.map((ecsApp) => {
        return new EcsappConstruct(this, `${props.prefix}-${ecsApp.appName}-FrontApp-Ecs-Resources`, {
          vpc: props.vpc,
          ecsCluster: ecsCommon.ecsCluster,
          appName: ecsApp.appName,
          prefix: props.prefix,
          appKey: props.appKey,
          alarmTopic: props.alarmTopic,
          allowFromSG: [frontAlb.appAlbSecurityGroup],
          portNumber: ecsApp.portNumber,
        });
      });
      this.frontEcsApps = frontEcsApps;

      //Pipeline for Frontend Rolling
      frontEcsApps.forEach((ecsApp, index) => {
        new PipelineEcspressoConstruct(this, `${props.prefix}-${ecsApp.appName}-FrontApp-Pipeline`, {
          prefix: props.prefix,
          appName: ecsApp.appName,
          ecsCluster: ecsCommon.ecsCluster,
          ecsServiceName: ecsApp.ecsServiceName,
          targetGroup: frontAlb.AlbTgs[index].lbForAppTargetGroup,
          securityGroup: ecsApp.securityGroupForFargate,
          vpc: props.vpc,
          logGroup: ecsApp.fargateLogGroup,
          ecsNameSpace: ecsCommon.ecsNameSpace,
          executionRole: ecsCommon.ecsTaskExecutionRole,
          // taskRole: props.taskRole,
        });
      });
    }

    if (props.ecsBackTasks) {
      const backEcsApps = props.ecsBackTasks.map((ecsApp) => {
        return new EcsappConstruct(this, `${props.prefix}-${ecsApp.appName}-BackApp-Ecs-Resources`, {
          vpc: props.vpc,
          ecsCluster: ecsCommon.ecsCluster,
          appName: ecsApp.appName,
          prefix: props.prefix,
          appKey: props.appKey,
          alarmTopic: props.alarmTopic,
          allowFromSG: this.frontEcsApps.map((ecsAlbApp) => ecsAlbApp.securityGroupForFargate),
          portNumber: ecsApp.portNumber,
          useServiceConnect: true,
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
          ecsNameSpace: ecsCommon.ecsNameSpace,
          executionRole: ecsCommon.ecsTaskExecutionRole,
          // taskRole: props.taskRole,
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
