import requests
import threading
import time
import random

BASE_URL = "http://184.174.36.49:5000/"

# Messages specifically crafted to trigger the "visualize" intent 
# and various chart types (pie, bar, line) based on graph.py logic
graph_messages = [
    "Give a bar graph of gender distribution in the cooperatives",
    "Show me a pie chart of approval status for all cooperatives",
    "Visualize the number of members per state",
    "Plot a line chart showing the trend of cooperatives created over time",
    "Show a chart comparing the number of male and female directors",
    "Graph the distribution of members by county"
]

TOTAL_REQUESTS = 50  # Kept lower than standard chat because graph generation is heavy
results = []
success_count = 0
failed_count = 0
missing_graph_count = 0

# Lock for safely updating shared counters across threads
lock = threading.Lock()

def send_graph_request(i):
    global success_count, failed_count, missing_graph_count
    
    payload = {"message": random.choice(graph_messages)}
    try:
        start = time.time()
        response = requests.post(f"{BASE_URL}/chat", json=payload)
        duration = time.time() - start
        
        results.append(duration)
        
        if response.status_code == 200:
            data = response.json()
            # Check if the graph was actually generated and returned
            if data.get("graph_base64") or data.get("graph_svg"):
                with lock:
                    success_count += 1
                print(f"[GRAPH] Request {i} | Status: 200 | Time: {duration:.2f}s | Result: SUCCESS")
            else:
                with lock:
                    missing_graph_count += 1
                print(f"[GRAPH] Request {i} | Status: 200 | Time: {duration:.2f}s | Result: NO GRAPH RETURNED")
        else:
            with lock:
                failed_count += 1
            print(f"[GRAPH] Request {i} | Status: {response.status_code} | Time: {duration:.2f}s | Result: HTTP ERROR")
            
    except Exception as e:
        with lock:
            failed_count += 1
        print(f"[GRAPH] Request {i} failed: {e}")

threads = []
start_test = time.time()

print(f"Starting Graph Generation Stress Test with {TOTAL_REQUESTS} concurrent requests...")

for i in range(TOTAL_REQUESTS):
    t = threading.Thread(target=send_graph_request, args=(i,))
    t.start()
    threads.append(t)

for t in threads:
    t.join()

end_test = time.time()

print("\n" + "="*40)
print("Graph Stress Test Finished")
print("="*40)
print(f"Total Requests: {TOTAL_REQUESTS}")
print(f"Total Time: {round(end_test - start_test, 2)} seconds")

if results:
    print(f"Average Response Time: {round(sum(results)/len(results), 2)} seconds")
    print(f"Max Response Time: {round(max(results), 2)} seconds")
    print(f"Min Response Time: {round(min(results), 2)} seconds")

print("-" * 40)
print(f"Successful Graph Generations: {success_count}")
print(f"Failed Requests (Errors): {failed_count}")
print(f"Completed but Missing Graphs (Data/SQL errors): {missing_graph_count}")
