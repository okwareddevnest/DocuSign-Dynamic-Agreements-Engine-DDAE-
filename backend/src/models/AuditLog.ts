import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../config/database';

export interface AuditLogAttributes {
  id: string;
  entityType: 'agreement' | 'template';
  entityId: string;
  action: 'create' | 'update' | 'delete' | 'send' | 'sign' | 'void' | 'expire';
  changes: {
    before?: Record<string, any>;
    after?: Record<string, any>;
  };
  metadata: Record<string, any>;
  createdAt: Date;
}

export class AuditLog extends Model<AuditLogAttributes> implements AuditLogAttributes {
  public id!: string;
  public entityType!: 'agreement' | 'template';
  public entityId!: string;
  public action!: 'create' | 'update' | 'delete' | 'send' | 'sign' | 'void' | 'expire';
  public changes!: {
    before?: Record<string, any>;
    after?: Record<string, any>;
  };
  public metadata!: Record<string, any>;
  public readonly createdAt!: Date;
}

AuditLog.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    entityType: {
      type: DataTypes.ENUM('agreement', 'template'),
      allowNull: false,
    },
    entityId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    action: {
      type: DataTypes.ENUM('create', 'update', 'delete', 'send', 'sign', 'void', 'expire'),
      allowNull: false,
    },
    changes: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'audit_logs',
    timestamps: true,
    updatedAt: false,
    indexes: [
      {
        fields: ['entityType', 'entityId'],
      },
      {
        fields: ['action'],
      },
      {
        fields: ['createdAt'],
      },
    ],
  }
); 