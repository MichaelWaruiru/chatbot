import os
from dotenv import load_dotenv
from langchain_community.utilities import SQLDatabase

# Load the environment variables
load_dotenv()

print("Testing Remote MySQL Connection to co-opmagic...")
try:
    db_uri = os.getenv("DB_URI")
    if not db_uri:
        print("Error: DB_URI is completely missing from your .env file!")
        exit()

    # Attempt to connect
    db = SQLDatabase.from_uri(db_uri)
    
    # Fetch the tables to prove the connection works and permissions are correct
    tables = db.get_usable_table_names()
    
    print("Success! Connected to the remote database.")
    print(f"Found tables: {tables}")

except Exception as e:
    print(f"Connection Failed: {e}")
