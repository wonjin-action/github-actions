import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Chatbot } from '../construct/chatbot-construct';
import { Cognito } from '../construct/cognito-construct';
import { KMSKey } from '../construct/kms-key-construct';
import * as kms from 'aws-cdk-lib/aws-kms';
import { Vpc } from '../construct/vpc-construct';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { SNS } from '../construct/sns-construct';
import { Topic } from 'aws-cdk-lib/aws-sns';

export interface ShareResourcesStackProps extends cdk.StackProps {
  pjPrefix: string;
  notifyEmail: string;
  channelId: string;
  workspaceId: string;
  domainPrefix: string;
  urlForCallback: string[];
  urlForLogout: string[];
  myVpcCidr: string;
  myVpcMaxAzs: number;
}

export class ShareResourcesStack extends cdk.Stack {
  public readonly appKey: kms.Key;
  public readonly myVpc: ec2.Vpc;
  public readonly alarmTopic: Topic;

  constructor(scope: Construct, id: string, props: ShareResourcesStackProps) {
    super(scope, id, props);

    const alarmTopic = new SNS(this, `${props.pjPrefix}-Alarm`, {
      notifyEmail: props.notifyEmail,
    });
    this.alarmTopic = alarmTopic.topic;

    const chatbot = new Chatbot(this, `${props.pjPrefix}-Chatbot`, {
      topicArn: alarmTopic.topic.topicArn,
      workspaceId: props.workspaceId,
      channelId: props.channelId,
    });

    const cognito = new Cognito(this, `${props.pjPrefix}-Cognito`, {
      domainPrefix: props.domainPrefix,
      urlForCallback: props.urlForCallback,
      urlForLogout: props.urlForLogout,
    });
    // CMK for Apps
    const appKey = new KMSKey(this, `${props.pjPrefix}-AppKey`);

    this.appKey = appKey.kmsKey;

    // Networking
    const vpc = new Vpc(this, `${props.pjPrefix}-Vpc`, {
      myVpcCidr: props.myVpcCidr,
      myVpcMaxAzs: props.myVpcMaxAzs,
    });

    this.myVpc = vpc.myVpc;
  }
}
