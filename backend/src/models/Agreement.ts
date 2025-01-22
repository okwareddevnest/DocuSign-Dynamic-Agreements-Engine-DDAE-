import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { Template } from './Template';

export interface AgreementAttributes {
  id: string;
  templateId: string;
  docusignEnvelopeId: string;
  status: 'draft' | 'sent' | 'signed' | 'expired' | 'voided';
  currentValues: Record<string, any>;
  signers: Array<{
    email: string;
    name: string;
    role: string;
    status: 'pending' | 'signed' | 'declined';
  }>;
  metadata: Record<string, any>;
  lastChecked: Date;
  createdAt: Date;
  updatedAt: Date;
}

export class Agreement extends Model<AgreementAttributes> implements AgreementAttributes {
  public id!: string;
  public templateId!: string;
  public docusignEnvelopeId!: string;
  public status!: 'draft' | 'sent' | 'signed' | 'expired' | 'voided';
  public currentValues!: Record<string, any>;
  public signers!: Array<{
    email: string;
    name: string;
    role: string;
    status: 'pending' | 'signed' | 'declined';
  }>;
  public metadata!: Record<string, any>;
  public lastChecked!: Date;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  // Associations
  public readonly template?: Template;
}

Agreement.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    templateId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'templates',
        key: 'id',
      },
    },
    docusignEnvelopeId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('draft', 'sent', 'signed', 'expired', 'voided'),
      allowNull: false,
      defaultValue: 'draft',
    },
    currentValues: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    signers: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    lastChecked: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'agreements',
    indexes: [
      {
        unique: true,
        fields: ['docusignEnvelopeId'],
      },
      {
        fields: ['templateId'],
      },
      {
        fields: ['status'],
      },
    ],
  }
);

// Setup associations
Agreement.belongsTo(Template, {
  foreignKey: 'templateId',
  as: 'template',
}); 