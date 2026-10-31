// Parameterized statements shared by the API and real-SQLite concurrency tests.
// Every mutation is conditional in SQL; JS reads never grant write permissions.
// Keep whitespace around CASE / END in SQL literals: Wrangler 4.92's file splitter
// recognizes compound statements by whitespace-delimited keywords (see the D1 test).
export const coopQueries = {
  create: `INSERT INTO coop_gardens(id,name,intro,creator_id,created_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING`,
  firstRound: `INSERT INTO coop_rounds(coop_id,number,growth,started_at) SELECT id,1,0,? FROM coop_gardens WHERE id=? AND creator_id=? ON CONFLICT(coop_id,number) DO NOTHING`,
  join: `INSERT INTO coop_members(id,coop_id,user_id,joined_at)
    SELECT ?,id,?,? FROM coop_gardens WHERE id=?
    AND NOT EXISTS(SELECT 1 FROM coop_members WHERE coop_id=coop_gardens.id AND user_id=? AND left_at IS NULL)`,
  createMember: `INSERT INTO coop_members(id,coop_id,user_id,joined_at)
    SELECT ?,id,?,? FROM coop_gardens WHERE id=? AND creator_id=?
    AND NOT EXISTS(SELECT 1 FROM coop_members WHERE coop_id=coop_gardens.id AND user_id=? AND left_at IS NULL)`,
  leave: `UPDATE coop_members SET left_at=? WHERE coop_id=? AND user_id=? AND left_at IS NULL`,
  edit: `UPDATE coop_gardens SET name=?,intro=?,updated_at=? WHERE id=? AND owner_id=?
    AND EXISTS(SELECT 1 FROM users WHERE id=? AND account_status='active')
    AND EXISTS(SELECT 1 FROM coop_members WHERE coop_id=coop_gardens.id AND user_id=? AND left_at IS NULL)`,
  water: `INSERT INTO coop_waters(id,coop_id,round_number,user_id,day,created_at)
    SELECT ?,c.id,c.current_round+ CASE WHEN r.matured_day<? THEN 1 ELSE 0 END ,?,?,?
    FROM coop_gardens c JOIN coop_rounds r ON r.coop_id=c.id AND r.number=c.current_round
    WHERE c.id=? AND NOT EXISTS(SELECT 1 FROM coop_waters WHERE user_id=? AND day=?)`,
};
