import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as sns from 'aws-cdk-lib/aws-sns';
import { IEcsAlbParam, IEcsParam, ICertificateIdentifier } from '../../params/interface';
import { EcsAppConstruct } from '../construct/ecs-app-construct';

interface EcsAppStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  appKey: kms.IKey;
  alarmTopic: sns.Topic;
  prefix: string;
  AlbCertificateIdentifier: ICertificateIdentifier;
  ecsFrontTasks: IEcsAlbParam;
  ecsBackTasks: IEcsParam[];
  ecsBastionTasks?: boolean;
}

export class EcsAppStack extends cdk.Stack {
  public readonly app: EcsAppConstruct;

  constructor(scope: Construct, id: string, props: EcsAppStackProps) {
    super(scope, id, props);

    const ecs = new EcsAppConstruct(this, `${props.prefix}-ECSApp`, {
      vpc: props.vpc,
      appKey: props.appKey,
      alarmTopic: props.alarmTopic,
      prefix: props.prefix,
      AlbCertificateIdentifier: props.AlbCertificateIdentifier,
      ecsFrontTasks: props.ecsFrontTasks,
      ecsBackTasks: props.ecsBackTasks,
      ecsBastionTasks: props.ecsBastionTasks ?? true,
    });
    this.app = ecs;
  }
}
