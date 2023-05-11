import {
  DataType,
  Table,
  ForeignKey,
  BelongsTo,
  Column,
  Unique,
  AllowNull,
} from "sequelize-typescript";
import { IntegrationService } from "@shared/types";
import Integration from "./Integration";
import Team from "./Team";
import User from "./User";
import IdModel from "./base/IdModel";
import Encrypted, {
  getEncryptedColumn,
  setEncryptedColumn,
} from "./decorators/Encrypted";
import Fix from "./decorators/Fix";

@Table({ tableName: "authentications", modelName: "authentication" })
@Fix
class IntegrationAuthentication extends IdModel {
  @Column(DataType.STRING)
  service: IntegrationService;

  @Column(DataType.ARRAY(DataType.STRING))
  scopes: string[];

  @Column(DataType.BLOB)
  @Encrypted
  get token() {
    return getEncryptedColumn(this, "token");
  }

  set token(value: string) {
    setEncryptedColumn(this, "token", value);
  }

  // associations

  @BelongsTo(() => User, "userId")
  user: User;

  @ForeignKey(() => User)
  @Column(DataType.UUID)
  userId: string;

  @BelongsTo(() => Team, "teamId")
  team: Team;

  @ForeignKey(() => Team)
  @Column(DataType.UUID)
  teamId: string;

  @BelongsTo(() => Integration, "integrationId")
  integration: Integration;

  @ForeignKey(() => Integration)
  @Unique
  @AllowNull(false)
  @Column(DataType.UUID)
  integrationId: string;
}

export default IntegrationAuthentication;
