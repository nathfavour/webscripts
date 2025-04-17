#!/bin/bash

voteUrl="https://www.oyep.org/oyostateyouthsummit2025/vote/"
submitUrl="https://www.oyep.org/wp-admin/admin-ajax.php"
numVotes=100  # Number of votes to submit
minDelay=2   # Minimum delay in seconds
maxDelay=6   # Maximum delay in seconds
fixedToken="374daa3aa45bbe4329ea6d4befc13af7"
useFixedTimestamps=false

successfulVotes=0
failedVotes=0

# Sample user agents
userAgents=(
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/113.0.0.0 Safari/537.36"
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15"
  "Mozilla/5.0 (Linux; Android 11; SM-G991U) AppleWebKit/537.36 Chrome/112.0.5615.136 Mobile Safari/537.36"
  "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1"
)

submit_vote() {
  if $useFixedTimestamps; then
    startTime="1744782481"
    endTime="1744782519"
  else
    startTime=$(date -u -v -30S +%s)
    endTime=$(date -u +%s)
  fi

  # Pick a random user agent
  rand=$((RANDOM % ${#userAgents[@]}))
  userAgent="${userAgents[$rand]}"

  response=$(curl -s -X POST "$submitUrl" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -H "User-Agent: $userAgent" \
    -H "Referer: $voteUrl" \
    --data-urlencode "wpforms[fields][17]=Adegbite    Happiness (Prof Shipoti)" \
    --data-urlencode "wpforms[fields][22]=" \
    --data-urlencode "wpforms[fields][15]=Ridwanullahi Yusuf Omotola" \
    --data-urlencode "wpforms[fields][2]=" \
    --data-urlencode "wpforms[id]=680" \
    --data-urlencode "page_title=Vote" \
    --data-urlencode "page_url=$voteUrl" \
    --data-urlencode "page_id=690" \
    --data-urlencode "wpforms[post_id]=690" \
    --data-urlencode "wpforms[submit]=wpforms-submit" \
    --data-urlencode "wpforms[token]=$fixedToken" \
    --data-urlencode "action=wpforms_submit" \
    --data-urlencode "start_timestamp=$startTime" \
    --data-urlencode "end_timestamp=$endTime"
  )

  echo "$response"
}

echo "Starting randomized vote submission..."

for ((i=1; i<=numVotes; i++)); do
  echo "Vote $i: Submitting..."
  
  result=$(submit_vote)

  if [[ "$result" == *'"success":true'* || "$result" == *'"success": true'* ]]; then
    echo "---- Successful Result Output Started---------"
    echo "$result"
    ((successfulVotes++))
    echo "---- Successful Result Output Ended---------"
  else
    echo "---- Failed Result Output Started---------"
    echo "$result"
    ((failedVotes++))
    echo "---- Failed Result Output Ended---------"
  fi

  if [[ $i -lt $numVotes ]]; then
    delay=$((RANDOM % (maxDelay - minDelay + 1) + minDelay))
    echo "Sleeping for $delay seconds..."
    sleep $delay
  fi

  echo "----------------------------"
done

echo "Done. $successfulVotes successful, $failedVotes failed."