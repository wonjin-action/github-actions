import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';

export interface MynvOidcIAMRoleConstructProps extends cdk.StackProps {
  OrganizationName: string;
  RepositoryName: string;
  openIdConnectProviderArn: string;
  statement: iam.PolicyStatementProps[];
}

export class MynvOidcIAMRoleConstruct extends Construct {
  constructor(scope: Construct, id: string, props: MynvOidcIAMRoleConstructProps) {
    super(scope, id);

    const oidcRole = new iam.Role(this, id, {
      assumedBy: new iam.WebIdentityPrincipal(props.openIdConnectProviderArn, {
        StringEquals: {
          ['token.actions.githubusercontent.com:aud']: 'sts.amazonaws.com',
        },
        StringLike: {
          ['token.actions.githubusercontent.com:sub']:
            'repo:' + props.OrganizationName + '/' + props.RepositoryName + ':*',
        },
      }),
    });

    for (const value of props.statement) {
      const oidcPolicy = new iam.PolicyStatement({
        effect: value.effect,
        actions: value.actions,
        resources: value.resources,
        conditions: value.conditions,
      });
      oidcRole.addToPolicy(oidcPolicy);
    }
  }
}
