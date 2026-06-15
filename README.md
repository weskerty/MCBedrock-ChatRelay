<div align="center">

# endstone-chatrelay

</div>



https://github.com/user-attachments/assets/df7440fe-0601-4ef0-8454-f93e7847c3bd



A plugin that publi minecraft chat, joins, quits, and deaths.


</details>

# setup

1. Take the .whl file from the latest release and put it into the server’s plugins/ folder

2. Install redis on endstone server
python -m pip install redis

2. Start the server once, then *(optionally)* close it
- This creates the config file

3. Open plugins/ChatRelay/config.yml and config redis or valkey

4. Ejecute plugins scripts

4. Start the server again, and it will load. Otherwise, the logs will tell you why it didn't!
