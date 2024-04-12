import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
export declare class Frontend extends cdk.Stack {
    readonly endpoint: string;
    constructor(scope: Construct, id: string, props?: cdk.StackProps);
}
