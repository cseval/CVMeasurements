import os
import uuid
from datetime import date
import mysql.connector
from dotenv import load_dotenv

load_dotenv()


def _connect():
    return mysql.connector.connect(
        host=os.environ['DB_HOST'],
        port=int(os.environ.get('DB_PORT', 3306)),
        database=os.environ['DB_NAME'],
        user=os.environ['DB_USER'],
        password=os.environ['DB_PASSWORD'],
    )


def search_athletes(query: str) -> list[dict]:
    tokens = query.strip().split()
    if not tokens:
        return []

    conn = _connect()
    cursor = conn.cursor(dictionary=True)

    # Each token must match either first or last name — handles "First Last" input
    conditions = ' AND '.join(
        ['(FirstName LIKE %s OR LastName LIKE %s)'] * len(tokens)
    )
    params = [f'%{t}%' for t in tokens for _ in range(2)]

    cursor.execute(
        f"""SELECT CSE_PlayerID AS id,
                   FirstName    AS first_name,
                   LastName     AS last_name
            FROM player
            WHERE {conditions}
            ORDER BY LastName, FirstName
            LIMIT 50""",
        params,
    )
    results = cursor.fetchall()
    conn.close()
    return results


def search_events(query: str) -> list[dict]:
    tokens = query.strip().split()
    if not tokens:
        return []
    conn = _connect()
    cursor = conn.cursor(dictionary=True)
    conditions = ' AND '.join(['EventName LIKE %s'] * len(tokens))
    params = [f'%{t}%' for t in tokens]
    cursor.execute(
        f"""SELECT CSE_EventID AS id, EventName AS name, Date AS date,
                   City AS city, State AS state
            FROM events
            WHERE {conditions}
            ORDER BY Date DESC
            LIMIT 20""",
        params,
    )
    results = cursor.fetchall()
    conn.close()
    return [
        {**r, 'date': r['date'].isoformat() if r['date'] else None}
        for r in results
    ]


def get_event_roster(event_id: int) -> list[dict]:
    conn = _connect()
    cursor = conn.cursor(dictionary=True)
    cursor.execute(
        """SELECT DISTINCT a.first_name, a.last_name, p.CSE_PlayerID AS id, a.userid AS user_id
           FROM attendees a
           INNER JOIN player p ON a.userid = p.UserID
           WHERE a.event_id = %s
           ORDER BY a.last_name, a.first_name""",
        (event_id,),
    )
    results = cursor.fetchall()
    conn.close()
    return results


def update_additional(row_id: int, fields: dict) -> None:
    allowed = {
        'age', 'weight',
        'hips_r_hip_er', 'hips_r_hip_ir', 'hips_l_hip_er', 'hips_l_hip_ir',
        'tspine_tspine_rot_l', 'tspine_tspine_rot_r',
        'grip_grip_str_r', 'grip_grip_str_l',
    }
    updates = {k: v for k, v in fields.items() if k in allowed and v is not None}
    if not updates:
        return
    set_clause = ', '.join(f'{k} = %s' for k in updates)
    conn = _connect()
    cursor = conn.cursor()
    cursor.execute(
        f'UPDATE lab_movement_screen SET {set_clause} WHERE id = %s',
        (*updates.values(), row_id),
    )
    conn.commit()
    conn.close()


def get_athlete_status(player_id: int) -> dict:
    """
    Check whether this player has a row in lab_movement_screen and whether
    that row already has measurement data filled in.

    Returns:
        exists   - bool, player has a row in the table
        has_data - bool, at least one measurement column is filled
        row_id   - int | None
    """
    conn = _connect()
    cursor = conn.cursor(dictionary=True)
    cursor.execute(
        """SELECT id, height, wingspan, hand_size
           FROM lab_movement_screen
           WHERE cse_player_id = %s
           ORDER BY session_date DESC, created_at DESC
           LIMIT 1""",
        (player_id,),
    )
    row = cursor.fetchone()
    conn.close()

    if not row:
        return {'exists': False, 'has_data': False, 'row_id': None}

    has_data = any(row[col] is not None for col in ('height', 'wingspan', 'hand_size'))
    return {'exists': True, 'has_data': has_data, 'row_id': row['id']}


def upsert_measurement(
    player_id: int,
    first_name: str,
    last_name: str,
    height_cm: float,
    wingspan_cm: float,
    hand_width_cm: float,
    event_id: int | None = None,
    user_id: int | None = None,
) -> tuple[int, str]:
    """
    Smart save:
      - Player not in table         → INSERT new row
      - Player in table (any state) → UPDATE that row's measurements

    height stored in cm (string), wingspan and hand_size in inches.
    Returns (row_id, action) where action is 'inserted' or 'updated'.
    """
    height_str  = str(round(height_cm, 2))
    wingspan_in = round(wingspan_cm   / 2.54)
    hand_in     = round(hand_width_cm / 2.54, 1)
    today       = date.today().isoformat()

    status = get_athlete_status(player_id)
    conn   = _connect()
    cursor = conn.cursor()

    if status['exists']:
        cursor.execute(
            """UPDATE lab_movement_screen
               SET height = %s, wingspan = %s, hand_size = %s,
                   event_id = COALESCE(%s, event_id),
                   user_id = COALESCE(%s, user_id)
               WHERE id = %s""",
            (height_str, wingspan_in, hand_in, event_id, user_id, status['row_id']),
        )
        row_id = status['row_id']
        action = 'updated'
    else:
        cursor.execute(
            """INSERT INTO lab_movement_screen
               (cse_player_id, first_name, last_name, height, wingspan,
                hand_size, screen_id, session_date, assessment_date, event_id, user_id)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (
                player_id, first_name, last_name,
                height_str, wingspan_in, hand_in,
                str(uuid.uuid4()), today, today, event_id, user_id,
            ),
        )
        row_id = cursor.lastrowid
        action = 'inserted'

    conn.commit()
    conn.close()
    return row_id, action
