import { findByStoreName } from "@vendetta/metro"
import { FluxDispatcher } from "@vendetta/metro/common"
import { logger } from "@vendetta"
import { settings } from ".."
import { DeepL, GTranslate } from "../api"

const UserStore = findByStoreName("UserStore")
const ChannelStore = findByStoreName("ChannelStore")
const separator = "\n"

const emojiRegex = /<(a?):\w+:\d+>|<@!?\d+>|<#\d+>/g

const handler = async ({ message, optimistic }) => {
    try {
        if (optimistic) return // already handled locally
        if (settings.auto_translate_enabled === false) return
        if (!message?.content) return

        const currentUser = UserStore.getCurrentUser()
        if (message.author?.id === currentUser?.id) return // don't translate own messages

        const target_lang = settings.target_lang
        const isImmersive = settings.immersive_enabled

        const placeholders: string[] = []
        const textToTranslate = message.content.replace(emojiRegex, (match: string) => {
            placeholders.push(match)
            return ` [[${placeholders.length - 1}]] `
        })

        let translate
        switch (settings.translator) {
            case 0:
                translate = await DeepL.translate(textToTranslate, undefined, target_lang, false)
                break
            case 1:
            default:
                translate = await GTranslate.translate(textToTranslate, undefined, target_lang, false)
                break
        }

        let translatedText = translate.text
        placeholders.forEach((original, index) => {
            const pRegex = new RegExp(`\\[\\[\\s*${index}\\s*\\]\\]`, 'g')
            translatedText = translatedText.replace(pRegex, original)
        })

        // skip if translation result is basically identical to the original (likely already in target language)
        if (translatedText.trim().toLowerCase() === message.content.trim().toLowerCase()) return

        const finalContent = isImmersive
            ? `${message.content}${separator}${translatedText.trim()} \`[${target_lang?.toLowerCase()}]\``
            : `${translatedText.trim()} \`[${target_lang?.toLowerCase()}]\``

        FluxDispatcher.dispatch({
            type: "MESSAGE_UPDATE",
            message: {
                id: message.id,
                channel_id: message.channel_id,
                guild_id: ChannelStore.getChannel(message.channel_id)?.guild_id,
                content: finalContent,
            },
            log_edit: false,
            otherPluginBypass: true
        })
    } catch (e) {
        logger.error(e)
    }
}

export default () => {
    FluxDispatcher.subscribe("MESSAGE_CREATE", handler)
    return () => FluxDispatcher.unsubscribe("MESSAGE_CREATE", handler)
}
