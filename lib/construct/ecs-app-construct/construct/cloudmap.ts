import { Duration } from 'aws-cdk-lib';
import { IVpc } from 'aws-cdk-lib/aws-ec2';
import { PrivateDnsNamespace, DnsRecordType, Service } from 'aws-cdk-lib/aws-servicediscovery';
import { Construct } from 'constructs';

interface CloudMapProps {
  namespaceName: string;
  vpc: IVpc;
}

export class CloudMap extends Construct {
  public readonly frontendService: Service;
  public readonly backendService: Service;
  public readonly authService: Service;

  constructor(scope: Construct, id: string, props: CloudMapProps) {
    super(scope, id);

    // Service Discovery NameSpace.
    const namespace = new PrivateDnsNamespace(this, 'Namespace', {
      name: props.namespaceName,
      vpc: props.vpc,
    });

    const backendService = namespace.createService('BackendService', {
      name: 'backend',
      dnsRecordType: DnsRecordType.A,
      dnsTtl: Duration.seconds(30),
    });
    this.backendService = backendService;

    const frontendService = namespace.createService('FrontendService', {
      name: 'frontend',
      dnsRecordType: DnsRecordType.A,
      dnsTtl: Duration.seconds(30),
    });
    this.frontendService = frontendService;

    const authService = namespace.createService('AuthService', {
      name: 'auth',
      dnsRecordType: DnsRecordType.A,
      dnsTtl: Duration.seconds(30),
    });
    this.authService = authService;
  }
}
