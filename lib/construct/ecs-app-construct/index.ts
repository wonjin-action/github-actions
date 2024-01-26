import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as sns from 'aws-cdk-lib/aws-sns';
import { EcsappConstruct } from './construct/ecs-app-construct';
import { EcsCommonConstruct } from './construct/ecs-common-construct';
import { PipelineBgConstruct } from './construct/pipeline-blue-green-construct';
import { PipelineEcspressoConstruct } from './construct/pipeline-ecspresso-construct';
import { AlbConstruct } from './construct/alb-construct';
import { AlbBgConstruct } from './construct/alb-blue-green-construct';
import { EcsServiceConstruct } from './construct/ecs-service-construct';
import { IEcsAlbParam, IEcsParam, ICertificateIdentifier } from '../../../params/interface';
import { BastionECSAppConstruct } from './construct/bastion-ecs-construct';

interface EcsAppConstructProps {
  vpc: ec2.Vpc;
  appKey: kms.IKey;
  alarmTopic: sns.Topic;
  prefix: string;
  AlbCertificateIdentifier: ICertificateIdentifier;
  AlbBgCertificateIdentifier: ICertificateIdentifier;
  ecsFrontTasks: IEcsAlbParam;
  ecsFrontBgTasks: IEcsAlbParam;
  ecsBackTasks: IEcsParam[];
  ecsBackBgTasks: IEcsAlbParam;
  ecsBastionTasks: boolean;
}

export class EcsAppConstruct extends Construct {
  public readonly frontAlb: AlbConstruct;
  public readonly frontAlbBg: AlbBgConstruct;
  public readonly frontEcsApps: EcsappConstruct[];
  public readonly frontEcsAppsBg: EcsappConstruct[];
  public readonly backendAlbBg: AlbBgConstruct;
  public readonly backEcsApps: EcsappConstruct[];
  public readonly backEcsAppsBg: EcsappConstruct[];
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

    // ECSサービスパターン1. Frontend Rolling
    // CloudFront + Public ALB + ECS resources(Repo, Log Group, SG, CloudWatch) + ecspresso(Rolling update) Pipeline
    // ※ECSサービスはパイプラインのecspressoコマンドにて作成
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

    // ECSサービスパターン2. Backend Rolling
    // ECS resources(Repo, Log Group, SG, CloudWatch) + ecspresso(Rolling update) Pipeline
    // ※ECSサービスはパイプラインのecspressoコマンドにて作成
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

    // ECSサービスパターン3. Frontend Blue/Green
    // CloudFront + Public ALB + ECS resources(Repo, Log Group, SG, CloudWatch) + ECS Service + Blue/Green Pipeline
    if (props.ecsFrontBgTasks) {
      //Create Origin Resources
      const frontAlbBg = new AlbBgConstruct(this, `${props.prefix}-Frontend-Bg`, {
        vpc: props.vpc,
        alarmTopic: props.alarmTopic,
        AlbBgCertificateIdentifier: props.AlbBgCertificateIdentifier,
        ecsApps: props.ecsFrontBgTasks,
        internetFacing: true,
        subnetGroupName: 'Public',
      });
      this.frontAlbBg = frontAlbBg;

      const frontEcsAppsBg = props.ecsFrontBgTasks.map((ecsApp) => {
        return new EcsappConstruct(this, `${props.prefix}-${ecsApp.appName}-FrontApp-Ecs-Resources-Bg`, {
          vpc: props.vpc,
          ecsCluster: ecsCommon.ecsCluster,
          appName: ecsApp.appName,
          prefix: props.prefix,
          appKey: props.appKey,
          alarmTopic: props.alarmTopic,
          allowFromSG: [frontAlbBg.appAlbSecurityGroup],
          portNumber: ecsApp.portNumber,
        });
      });
      this.frontEcsAppsBg = frontEcsAppsBg;

      const frontEcsServices = frontEcsAppsBg.map((ecsApp) => {
        return new EcsServiceConstruct(this, ecsApp.ecsServiceName, {
          vpc: props.vpc,
          ecsCluster: ecsCommon.ecsCluster,
          ecsServiceName: ecsApp.ecsServiceName,
          ecsTaskExecutionRole: ecsCommon.ecsTaskExecutionRole,
          securityGroupForFargate: ecsApp.securityGroupForFargate,
          fargateLogGroup: ecsApp.fargateLogGroup,
        });
      });

      //ALB Target Group(Blue)に初期ECSサービスを登録
      frontAlbBg.AlbTgsBlue.forEach((AlbTg, index) => {
        AlbTg.lbForAppTargetGroup.addTarget(frontEcsServices[index].ecsService);
      });

      //Pipeline for Frontend Blue/Green
      frontEcsAppsBg.forEach((ecsApp, index) => {
        new PipelineBgConstruct(this, `${props.prefix}-${ecsApp.appName}-FrontApp-Bg-Pipeline`, {
          prefix: props.prefix,
          appName: ecsApp.appName,
          ecsService: frontEcsServices[index].ecsService,
          listener: frontAlbBg.ALbListenerBlue,
          testListener: frontAlbBg.ALbListenerGreen,
          blueTargetGroup: frontAlbBg.AlbTgsBlue[index].lbForAppTargetGroup,
          greenTargetGroup: frontAlbBg.AlbTgsGreen[index].lbForAppTargetGroup,
          securityGroup: ecsApp.securityGroupForFargate,
          vpc: props.vpc,
          logGroup: ecsApp.fargateLogGroup,
          executionRole: ecsCommon.ecsTaskExecutionRole,
        });
      });
    }

    // ECSサービスパターン4. Backend Blue/Green
    // Private ALB + ECS resources(Repo, Log Group, SG, CloudWatch) + ECS Service + Blue/Green Pipeline
    if (props.ecsBackBgTasks) {
      //Create Origin Resources
      const backendAlbBg = new AlbBgConstruct(this, `${props.prefix}-Backend-Bg`, {
        vpc: props.vpc,
        alarmTopic: props.alarmTopic,
        httpFlag: true,
        AlbBgCertificateIdentifier: props.AlbBgCertificateIdentifier,
        ecsApps: props.ecsBackBgTasks,
        internetFacing: false,
        allowFromSG: this.frontEcsAppsBg.map((ecsAlbApp) => ecsAlbApp.securityGroupForFargate),
        subnetGroupName: 'Private',
      });
      this.backendAlbBg = backendAlbBg;

      const backEcsAppsBg = props.ecsBackBgTasks.map((ecsApp) => {
        return new EcsappConstruct(this, `${props.prefix}-${ecsApp.appName}-BackApp-Ecs-Resources-Bg`, {
          vpc: props.vpc,
          ecsCluster: ecsCommon.ecsCluster,
          appName: ecsApp.appName,
          prefix: props.prefix,
          appKey: props.appKey,
          alarmTopic: props.alarmTopic,
          allowFromSG: [backendAlbBg.appAlbSecurityGroup],
          portNumber: ecsApp.portNumber,
        });
      });
      this.backEcsAppsBg = backEcsAppsBg;

      const backEcsServices = backEcsAppsBg.map((ecsApp) => {
        return new EcsServiceConstruct(this, ecsApp.ecsServiceName, {
          vpc: props.vpc,
          ecsCluster: ecsCommon.ecsCluster,
          ecsServiceName: ecsApp.ecsServiceName,
          ecsTaskExecutionRole: ecsCommon.ecsTaskExecutionRole,
          securityGroupForFargate: ecsApp.securityGroupForFargate,
          fargateLogGroup: ecsApp.fargateLogGroup,
        });
      });

      //ALB Target Group(Blue)に初期ECSサービスを登録
      backendAlbBg.AlbTgsBlue.forEach((AlbTg, index) => {
        AlbTg.lbForAppTargetGroup.addTarget(backEcsServices[index].ecsService);
      });

      // Pipeline for Backend Blue/Green
      backEcsAppsBg.forEach((ecsApp, index) => {
        new PipelineBgConstruct(this, `${props.prefix}-${ecsApp.appName}-BackApp-Bg-Pipeline`, {
          prefix: props.prefix,
          appName: ecsApp.appName,
          ecsService: backEcsServices[index].ecsService,
          listener: backendAlbBg.ALbListenerBlue,
          testListener: backendAlbBg.ALbListenerGreen,
          blueTargetGroup: backendAlbBg.AlbTgsBlue[index].lbForAppTargetGroup,
          greenTargetGroup: backendAlbBg.AlbTgsGreen[index].lbForAppTargetGroup,
          securityGroup: ecsApp.securityGroupForFargate,
          vpc: props.vpc,
          logGroup: ecsApp.fargateLogGroup,
          executionRole: ecsCommon.ecsTaskExecutionRole,
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
