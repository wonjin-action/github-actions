import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as sns from 'aws-cdk-lib/aws-sns';
import { IEcsAlbParam, IEcsParam, ICertificateIdentifier } from '../../params/interface';
import { EcsAppConstruct } from '../construct/ecs-app-construct';

interface EcsAppStackProps extends cdk.StackProps {
  myVpc: ec2.Vpc;
  appKey: kms.IKey;
  alarmTopic: sns.Topic;
  prefix: string;
  AlbCertificateIdentifier: ICertificateIdentifier;
  AlbBgCertificateIdentifier: ICertificateIdentifier;
  ecsFrontTasks: IEcsAlbParam;
  ecsFrontBgTasks: IEcsAlbParam;
  ecsBackTasks: IEcsParam[];
  ecsBackBgTasks: IEcsAlbParam;
  ecsBastionTasks?: boolean;
}

export class EcsAppStack extends cdk.Stack {
  public readonly app: EcsAppConstruct;

  constructor(scope: Construct, id: string, props: EcsAppStackProps) {
    super(scope, id, props);

    const ecs = new EcsAppConstruct(this, `${props.prefix}-ECSApp`, {
      myVpc: props.myVpc,
      appKey: props.appKey,
      alarmTopic: props.alarmTopic,
      prefix: props.prefix,
      AlbCertificateIdentifier: props.AlbCertificateIdentifier,
      AlbBgCertificateIdentifier: props.AlbBgCertificateIdentifier,
      ecsFrontTasks: props.ecsFrontTasks,
      ecsFrontBgTasks: props.ecsFrontBgTasks,
      ecsBackTasks: props.ecsBackTasks,
      ecsBackBgTasks: props.ecsBackBgTasks,
      ecsBastionTasks: props.ecsBastionTasks ?? true,
    });
    this.app = ecs;
  }
}
