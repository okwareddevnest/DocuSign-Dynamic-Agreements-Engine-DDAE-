import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../config/database';

export interface TemplateAttributes {
  id: string;
  name: string;
  description: string;
  docusignTemplateId: string;
  dynamicFields: Record<string, {
    type: 'price' | 'iot' | 'weather';
    source: string;
    path: string;
    threshold?: number;
    operator?: '>' | '<' | '==' | '>=' | '<=';
  }>;
  createdAt: Date;
  updatedAt: Date;
}

export class Template extends Model<TemplateAttributes> implements TemplateAttributes {
  public id!: string;
  public name!: string;
  public description!: string;
  public docusignTemplateId!: string;
  public dynamicFields!: Record<string, {
    type: 'price' | 'iot' | 'weather';
    source: string;
    path: string;
    threshold?: number;
    operator?: '>' | '<' | '==' | '>=' | '<=';
  }>;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Template.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    docusignTemplateId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    dynamicFields: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
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
    tableName: 'templates',
    indexes: [
      {
        unique: true,
        fields: ['docusignTemplateId'],
      },
    ],
  }
); 