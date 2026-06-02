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
               SET height = %s, wingspan = %s, hand_size = %s
               WHERE id = %s""",
            (height_str, wingspan_in, hand_in, status['row_id']),
        )
        row_id = status['row_id']
        action = 'updated'
    else:
        cursor.execute(
            """INSERT INTO lab_movement_screen
               (cse_player_id, first_name, last_name, height, wingspan,
                hand_size, screen_id, session_date, assessment_date)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (
                player_id, first_name, last_name,
                height_str, wingspan_in, hand_in,
                str(uuid.uuid4()), today, today,
            ),
        )
        row_id = cursor.lastrowid
        action = 'inserted'

    conn.commit()
    conn.close()
    return row_id, action
