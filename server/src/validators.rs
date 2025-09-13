use crate::collection_log::{CollectionLog, CollectionLogInfo};
use crate::error::ApiError;
use lazy_static::lazy_static;
use regex::Regex;

#[cfg(test)]
mod valid_name_tests {
    use super::*;

    #[test]
    fn valid_names() {
        let valid_names = [
            "test",
            "with space",
            "with 1234",
            "123",
            "with-dash",
            "dash-and space",
            "CAPITAL LETTERS",
            "MiXeD case-123",
            "0123456789",
            "underscore_name",
            " space",
            "space ",
        ];

        for name in valid_names {
            assert!(valid_name(name), "{} should have been a valid name", name);
        }
    }

    #[test]
    fn invalid_names() {
        let invalid_names = [
            "@SHARED",
            "invalid!",
            "@",
            "-=+[];'./,<>?\"\\|`~",
            "=",
            "+",
            "[",
            "]",
            ";",
            "'",
            ".",
            "/",
            ",",
            "<",
            ">",
            "?",
            "\"",
            "\\",
            "|",
            "`",
            "~",
            "",
            " ",
            "                 ",
        ];

        for name in invalid_names {
            assert!(
                !valid_name(name),
                "{} should have been an invalid name",
                name
            );
        }
    }
}

pub fn valid_name(name: &str) -> bool {
    lazy_static! {
        static ref NAME_RE: Regex = Regex::new("[^A-Za-z 0-9-_]").unwrap();
    }

    let len = name.len();
    (1..=16).contains(&len) && name.is_ascii() && !NAME_RE.is_match(name) && name.trim().len() > 0
}

pub fn validate_member_prop_length<T>(
    prop_name: &str,
    value: &Option<Vec<T>>,
    min: usize,
    max: usize,
) -> Result<(), ApiError> {
    match value {
        None => Ok(()),
        Some(x) => {
            if (min..=max).contains(&x.len()) {
                Ok(())
            } else {
                Err(ApiError::GroupMemberValidationError(format!(
                    "{} length violated range constraint {}..={} actual={}",
                    prop_name,
                    min,
                    max,
                    x.len()
                )))
            }
        }
    }
}

pub fn validate_collection_log(
    collection_log_info: &actix_web::web::Data<CollectionLogInfo>,
    collection_logs: &mut Option<Vec<CollectionLog>>,
) -> Result<(), ApiError> {
    match collection_logs {
        None => Ok(()),
        Some(ref mut x) => {
            for collection_log in x {
                let page_id = collection_log_info.page_name_to_id(&collection_log.page_name);
                let result = match page_id {
                    Some(id) => {
                        let number_of_items: usize = collection_log.items.len() / 2;
                        if number_of_items > collection_log_info.number_of_items_in_page(*id) {
                            return Err(ApiError::GroupMemberValidationError(format!(
                                "{} is too many items for collection log {}",
                                number_of_items, collection_log.page_name
                            )));
                        }

                        for i in (0..collection_log.items.len()).step_by(2) {
                            let item_id =
                                collection_log_info.remap_item_id(collection_log.items[i]);
                            collection_log.items[i] = item_id;
                            if !collection_log_info.has_item(*id, item_id) {
                                return Err(ApiError::GroupMemberValidationError(format!(
                                    "collection log {} does not have item id {}",
                                    collection_log.page_name, item_id
                                )));
                            }
                        }

                        Ok(())
                    }
                    None => Err(ApiError::GroupMemberValidationError(format!(
                        "invalid collection log page {}",
                        collection_log.page_name
                    ))),
                };

                if result.is_err() {
                    return result;
                }
            }

            Ok(())
        }
    }
}
