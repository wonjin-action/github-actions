import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { aws_wafv2 as wafv2 } from 'aws-cdk-lib';
import { aws_ec2 as ec2 } from 'aws-cdk-lib';
import { aws_kms as kms } from 'aws-cdk-lib';
import { aws_sns as sns } from 'aws-cdk-lib';
import { MynvEcsappConstruct } from './mynv-ecsapp-construct';
import { MynvEcsCommonConstruct } from './mynv-ecs-common-construct';
import { MynvPipelineBgConstruct } from './mynv-pipeline-bg-construct';
import { MynvPipelineEcspressoConstruct } from './mynv-pipeline-ecspresso-construct';
import { MynvCloudFrontConstruct } from './mynv-cloudfront-construct';
import { MynvAlbConstruct } from './mynv-alb-construct';
import { MynvAlbBgConstruct } from './mynv-alb-bg-construct';
import { MynvEcsServiceConstruct } from './mynv-ecs-service-construct';
import { IEcsAlbParam, IEcsParam, ICertificateIdentifier, ICloudFrontParam } from '../params/interface';
import { MynvBastionECSAppConstruct } from '../lib/mynv-bastion-ecs-construct';

interface MynvEcsStackProps extends cdk.StackProps {
  myVpc: ec2.Vpc;
  appKey: kms.IKey;
  webAcl: wafv2.CfnWebACL;
  alarmTopic: sns.Topic;
  prefix: string;
  cloudFrontParam: ICloudFrontParam;
  CertificateIdentifier: ICertificateIdentifier;
  AlbCertificateIdentifier: ICertificateIdentifier;
  AlbBgCertificateIdentifier: ICertificateIdentifier;
  ecsFrontTasks: IEcsAlbParam;
  ecsFrontBgTasks: IEcsAlbParam;
  ecsBackTasks: IEcsParam[];
  ecsBackBgTasks: IEcsAlbParam;
}

export class MynvEcsStack extends cdk.Stack {
  public readonly cloudFront: MynvCloudFrontConstruct;
  public readonly cloudFrontBg: MynvCloudFrontConstruct;
  public readonly frontAlb: MynvAlbConstruct;
  public readonly frontAlbBg: MynvAlbBgConstruct;
  public readonly frontEcsApps: MynvEcsappConstruct[];
  public readonly frontEcsAppsBg: MynvEcsappConstruct[];
  public readonly backendAlbBg: MynvAlbBgConstruct;
  public readonly backEcsApps: MynvEcsappConstruct[];
  public readonly backEcsAppsBg: MynvEcsappConstruct[];
  public readonly ecsCommon: MynvEcsCommonConstruct;
  public readonly bastionApp: MynvBastionECSAppConstruct;

  constructor(scope: Construct, id: string, props: MynvEcsStackProps) {
    super(scope, id, props);

    //ECS Common
    const ecsCommon = new MynvEcsCommonConstruct(this, `${props.prefix}-ECSCommon`, {
      myVpc: props.myVpc,
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
      const frontAlb = new MynvAlbConstruct(this, `${props.prefix}-FrontAlb`, {
        myVpc: props.myVpc,
        alarmTopic: props.alarmTopic,
        AlbCertificateIdentifier: props.AlbCertificateIdentifier,
        ecsApps: props.ecsFrontTasks,
      });
      this.frontAlb = frontAlb;

      const frontEcsApps = props.ecsFrontTasks.map((ecsApp) => {
        return new MynvEcsappConstruct(this, `${props.prefix}-${ecsApp.appName}-FrontApp-Ecs-Resources`, {
          myVpc: props.myVpc,
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
        new MynvPipelineEcspressoConstruct(this, `${props.prefix}-${ecsApp.appName}-FrontApp-Pipeline`, {
          prefix: props.prefix,
          appName: ecsApp.appName,
          ecsCluster: ecsCommon.ecsCluster,
          ecsServiceName: ecsApp.ecsServiceName,
          targetGroup: frontAlb.AlbTgs[index].lbForAppTargetGroup,
          securityGroup: ecsApp.securityGroupForFargate,
          myVpc: props.myVpc,
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
        return new MynvEcsappConstruct(this, `${props.prefix}-${ecsApp.appName}-BackApp-Ecs-Resources`, {
          myVpc: props.myVpc,
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
        new MynvPipelineEcspressoConstruct(this, `${props.prefix}-${ecsApp.appName}-BackApp-Pipeline`, {
          prefix: props.prefix,
          appName: ecsApp.appName,
          ecsCluster: ecsCommon.ecsCluster,
          ecsServiceName: ecsApp.ecsServiceName,
          securityGroup: ecsApp.securityGroupForFargate,
          myVpc: props.myVpc,
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
      const frontAlbBg = new MynvAlbBgConstruct(this, `${props.prefix}-Frontend-Bg`, {
        myVpc: props.myVpc,
        alarmTopic: props.alarmTopic,
        AlbBgCertificateIdentifier: props.AlbBgCertificateIdentifier,
        ecsApps: props.ecsFrontBgTasks,
        internetFacing: true,
        subnetGroupName: 'Public',
      });
      this.frontAlbBg = frontAlbBg;

      const frontEcsAppsBg = props.ecsFrontBgTasks.map((ecsApp) => {
        return new MynvEcsappConstruct(this, `${props.prefix}-${ecsApp.appName}-FrontApp-Ecs-Resources-Bg`, {
          myVpc: props.myVpc,
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
        return new MynvEcsServiceConstruct(this, ecsApp.ecsServiceName, {
          myVpc: props.myVpc,
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
        new MynvPipelineBgConstruct(this, `${props.prefix}-${ecsApp.appName}-FrontApp-Bg-Pipeline`, {
          prefix: props.prefix,
          appName: ecsApp.appName,
          ecsService: frontEcsServices[index].ecsService,
          listener: frontAlbBg.ALbListenerBlue,
          testListener: frontAlbBg.ALbListenerGreen,
          blueTargetGroup: frontAlbBg.AlbTgsBlue[index].lbForAppTargetGroup,
          greenTargetGroup: frontAlbBg.AlbTgsGreen[index].lbForAppTargetGroup,
          securityGroup: ecsApp.securityGroupForFargate,
          myVpc: props.myVpc,
          logGroup: ecsApp.fargateLogGroup,
          executionRole: ecsCommon.ecsTaskExecutionRole,
        });
      });
    }

    // ECSサービスパターン4. Backend Blue/Green
    // Private ALB + ECS resources(Repo, Log Group, SG, CloudWatch) + ECS Service + Blue/Green Pipeline
    if (props.ecsBackBgTasks) {
      //Create Origin Resources
      const backendAlbBg = new MynvAlbBgConstruct(this, `${props.prefix}-Backend-Bg`, {
        myVpc: props.myVpc,
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
        return new MynvEcsappConstruct(this, `${props.prefix}-${ecsApp.appName}-BackApp-Ecs-Resources-Bg`, {
          myVpc: props.myVpc,
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
        return new MynvEcsServiceConstruct(this, ecsApp.ecsServiceName, {
          myVpc: props.myVpc,
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
        new MynvPipelineBgConstruct(this, `${props.prefix}-${ecsApp.appName}-BackApp-Bg-Pipeline`, {
          prefix: props.prefix,
          appName: ecsApp.appName,
          ecsService: backEcsServices[index].ecsService,
          listener: backendAlbBg.ALbListenerBlue,
          testListener: backendAlbBg.ALbListenerGreen,
          blueTargetGroup: backendAlbBg.AlbTgsBlue[index].lbForAppTargetGroup,
          greenTargetGroup: backendAlbBg.AlbTgsGreen[index].lbForAppTargetGroup,
          securityGroup: ecsApp.securityGroupForFargate,
          myVpc: props.myVpc,
          logGroup: ecsApp.fargateLogGroup,
          executionRole: ecsCommon.ecsTaskExecutionRole,
        });
      });
    }
    //Bastion Container
    const bastionApp = new MynvBastionECSAppConstruct(this, `${props.prefix}-Bastion-ECSAPP`, {
      myVpc: props.myVpc,
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

    //Create CloudFront (共通で1つ)
    const cloudFront = new MynvCloudFrontConstruct(this, `${props.prefix}-CloudFront`, {
      webAcl: props.webAcl,
      cloudFrontParam: props.cloudFrontParam,
      CertificateIdentifier: props.CertificateIdentifier,
      //ターゲットに設定するALBをリストで指定する。defaultのみの場合は1つでOK。
      //BehaviorのルールはCloudFrontコンストラクト側で設定する。
      //1.Rolling ALBを指定（本テンプレートのデフォルト値）
      appAlbs: [this.frontAlb.appAlb],
      //2.Blue/Green ALBを指定
      //appAlbs: [this.frontAlbBg.appAlbBg],
      //3.Rolling ALB、Blue/Green ALB両方を指定（マルチオリジン）
      //appAlbs: [this.frontAlb.appAlb, this.frontAlbBg.appAlbBg],
    });
    this.cloudFront = cloudFront;
  }
}
