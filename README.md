# MCPE ChatRelay

Relays Minecraft chat (messages, joins, quits, deaths, broadcasts) to Telegram/Discord.  



https://github.com/user-attachments/assets/99c4b04a-4c82-413f-aff6-3d2646080beb



https://github.com/user-attachments/assets/df7440fe-0601-4ef0-8454-f93e7847c3bd


## Install

## Oficial BDS

<details> <summary>🌅More Info</summary> <table> <tr> <td>



</tr> </table> 

> [!NOTE]
> 

### Run Script:
```


```


</details>

</br>

## Endstone

<details> <summary>🌅More Info</summary> <table> <tr> <td>



</tr> </table> 

> [!NOTE]
> 

### Run Script:
```


```




[Download Plugin >](https://github.com/weskerty/endstone-chatrelay/releases/download/Plugin/endstone_chatrelay-3.0.0-py2.py3-none-any.whl) and Move file in endstone/bedrock_server/plugins

Start the server once — config is generated at `plugins/ChatRelay/config.yml` or manual;

## config.yml

```yaml
telegram:
  token: ""        # Bot token from @BotFather — leave empty to disable
  chat_id: ""      # Plain group: -100IDGROUP
                   # Topic group: -100IDGROUP/IDTHREAD
discord:
  webhook: ""      # Webhook URL — leave empty to disable
log: true          # Log relayed messages to server console
```

### Exampl

```yaml
telegram:
  token: '8xxx1:AAH_mxxxY'
  chat_id: '-1006799699989/736788'
discord:
  webhook: 'https://discord.com/api/webhooks/6xxx7/6xxxi_Sxxx7-gxxxT'
log: false
```

</details>

</br>

I use Arch btw and Endstone SystemD Service 

